const cors = require('cors');
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const mqtt = require('mqtt');
const Logs = require('./ClassLogs');
const config = require('./Config.json');
const { Client } = require('pg'); // PostgreSQL client
const httpApp = express();
const httpPort = config.Http.Port;

httpApp.use(cors());
httpApp.use(bodyParser.json({ limit: '50mb' }));
httpApp.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
httpApp.use(bodyParser.text({ type: 'text/plain' }));

let isNebulaeConnected = false;
var KAACon = null;
var Reconnect_Timeout = undefined;

httpApp.listen(httpPort, () => {
    startServer();
});

function startServer() {
    console.log(`HTTP NLS-REST Server started on port this ${httpPort}`);
    setTimeout(() => {
        mqttProcess();
    }, 3000)
}



// ######################################################## SIGNUP CODE STARTED #############################################################

function getToken() {
    // Create a new PostgreSQL client instance
    const client = new Client({
        user: config.DB.user,
        host: config.DB.host,
        database: config.DB.database,
        password: config.DB.password,
        port: config.DB.port,
    });

    // Connect to the PostgreSQL database
    return client.connect()
        .then(() => {
            // Query to verify user credentials
            const query = `
                SELECT * FROM users 
                WHERE username = $1 AND password = $2
            `;
            const values = [
                config.KAA.Credential.username, 
                config.KAA.Credential.password
            ];

            return client.query(query, values);
        })
        .then((result) => {
            if (result.rows.length > 0) {
                // Generate a random token if credentials are valid
                const accessToken = crypto.randomBytes(16).toString('hex');
                client.end(); // Close the database connection
                return { accessToken };
            } else {
                client.end(); // Close the database connection
                throw new Error('Invalid credentials');
            }
        })
        .catch((error) => {
            client.end(); // Ensure the database connection is closed on error
            return Promise.reject(error);
        });
}

// ######################################################## SIGN UP CODE END #############################################################




// ######################################################## MQTT CONNECTION CODE STARTED #############################################################

function stop_Timeout(timeOut) {
    return clearTimeout(timeOut);
}

function mqttProcess() {
    getToken()
        .then((data) => {
            let response = data.response;
            let body = JSON.parse(data.body);
            let expireTime = body['expires_in'] ? body['expires_in'] : '10000'
            if (response.statusCode === 200) {
                const accessToken = body.access_token;
                Logs.WriteLog('Get token:=', { accessToken: accessToken }, "Function_mqttProcess");
                connectMqtt({ SSL: true, KAAToken: accessToken });
                stop_Timeout(Reconnect_Timeout);
                Reconnect_Timeout = setTimeout(function () {
                    Logs.WriteLog('_Kaa_Server_Token is expired: ', body.access_token, "KAAToken");
                    isNebulaeConnected = false;
                    reCall();
                }, (expireTime > 8 * 3600 ? 8 * 3600 : expireTime) * 1000); //8*3600
            } else {
                reCall();
            }
        })
        .catch((error) => {
            Logs.WriteLog('Catch block error in Function_mqttProcess:=', error, "errorogs");
            console.error("Error while getting token:", error);
            reCall();
        });
}

function connectMqtt(KAASetup) {
    try {
        if (isNebulaeConnected == false) {
            const options = {
                clientId: `access:${KAASetup.KAAToken}`,
                clean: true,
                keepalive: 60,
                reconnectPeriod: 10000,
                connectTimeout: 30 * 1000
            };
            const l_uri = `mqtt://${config.KAA.Credential.url}:${config.KAA.Credential.mqtt_port}`;

            if (KAASetup.SSL) {
                options.rejectUnauthorized = false;
            }

            KAACon = mqtt.connect(l_uri, options);

            KAACon.on('connect', (connack) => {
                if (parseInt(connack.returnCode) === 0) {
                    console.log("nebulae connected");
                    isNebulaeConnected = true;
                    Logs.WriteLog('Connected:=', connack, "Function_connectMqtt");
                    SubscribeChannel()
                } else {
                    handleMqttError(connack.returnCode);
                    reCall();
                }
            });

            KAACon.on('reconnect', () => {
                console.log("reconnect nebulae");
                Logs.WriteLog('Re-Connected:=', {}, "Function_connectMqtt");
                KAACon.removeAllListeners('message');
            });

            KAACon.on('close', () => {
                console.log("nebulae close");
                Logs.WriteLog('Close:=', {}, "Function_connectMqtt");
                isNebulaeConnected = false;
                KAACon.removeAllListeners('message');
                KAACon.end(true);
                reCall();
            });

            KAACon.on('error', (err) => {
                console.error("nebulae error", err);
                Logs.WriteLog('Error:=', err, "Function_connectMqtt");
                handleMqttError(err);
            });
        } else {
            Logs.WriteLog('Over call:=', { isNebulaeConnected: isNebulaeConnected }, "Function_connectMqtt");
        }
    } catch (error) {
        Logs.WriteLog('Catch block error in Function_connectMqtt:=', error, "errorogs");
        reCall();
    }
}

function handleMqttError(errorCode) {
    Logs.WriteLog('Trying to connect again:=', errorCode, "Function_handleMqttError");
    const errorMessage = ErrorsByCode[parseInt(errorCode)] || errorCode;
    console.error("MQTT error:", errorMessage);
}

function reCall() {
    Logs.WriteLog('Trying to connect again:=', {}, "Function_reCall");
    setTimeout(mqttProcess, 10000); // Retry after 10 seconds
}

// ######################################################## MQTT CONNECTION CODE END #############################################################



// ######################################################## SUBSCRIPTION CODE STARTED #############################################################

function SubscribeChannel() {
    try {
        if (isNebulaeConnected == false) {
            reCall();
            return;
        }
        KAACon.subscribe(config.KAA.Credential.token + '/#', function (err, granted) {
            if (err) {
                Logs.WriteLog(`Error in subscribe channel - ${config.KAA.Credential.token}/$ :: `, err, "Function_SubscribeChannel");
                SubscribeChannel();
            }
            Logs.WriteLog(`Subscribe Successfully in  ${config.KAA.Credential.token}/$ :: `, granted, "Function_SubscribeChannel");
            if (granted.length > 0) {
                console.log("successfully subscribed", config.KAA.Credential.token + '/#')
            }
            else {
                SubscribeChannel();
            }
        });
        KAACon.removeAllListeners('message');
        KAACon.on('message', function (topic, message) {
            var payload = message.toString();
            var channel = topic;//topic.split('/')[1]
            Logs.WriteLog(`Got message in client id ${KAACon.options.clientId} :: `, { payload: payload, channel: channel }, "messageLogs");
        });
    } catch (error) {
        Logs.WriteLog('Catch block error in Function_SubscribeChannel=', error, "errorogs");
        SubscribeChannel();
    }
}

// ######################################################## SUBSCRIPTION CODE END #############################################################