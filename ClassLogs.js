var file = require("fs");
var moment = require('moment');
var filepath = require('./Config.json').Logging.Path;
var logPath = '';
const path = require('path');
function Logs() {
    //if (!file.existsSync("./CTS")) file.mkdirSync("./CTS");
    //if (!file.existsSync("./Log")) file.mkdirSync("./Logs");
    logPath = path.join(__dirname, '..', filepath)
    if (!file.existsSync(logPath)) file.mkdirSync(logPath);
}
Logs.prototype.WriteLog = function WriteLog(MessageData, MessageObject, MessageSource) {
    //WriteToConsole_local(MessageData, MessageObject);
    WriteToFile(MessageData, MessageObject, MessageSource);
}
Logs.prototype.WriteLogCallback = function WriteLogCallback(MessageData, MessageSource, callback) {
    WriteToConsole_local(MessageData, null);
    var filePath = logPath;
    var today = new Date();
    var date = moment(today, 'DD-MM-YYYY').format('DD-MM-YYYY');
    if (MessageSource) filePath += date + "_" + MessageSource + ".ctsLog";
    else filePath += date + "_Logs_CommonLogs" + ".ctsLog";
    file.appendFile(filePath, today + "::" + MessageData + "\r\n======\r\n", function (err) {
        if (err) return callback(true);
        else return callback(false);
    });
}
function WriteToFile(data, object, source) {
    try {
        if (object && object.constructor === Object) {
            object = JSON.stringify(object);
        }
        var filePath = logPath;
        var today = new Date();
        var date = moment(today, 'DD-MM-YYYY').format('DD-MM-YYYY');
        filePath = filePath + date + "_" + source + ".ctsLog";
        file.appendFile(filePath, today + "::" + data + "::" + object + "\r\n======\r\n", function (err) { });
    } catch (error) {
        console.log("~ file: ClassLogs.js:39 ~ WriteToFile ~ error:", error);
    }
}
Logs.prototype.WriteToConsole = function WriteToConsole(data, object) {
    WriteToConsole_local(data, object)
}
function WriteToConsole_local(data, object) {
    console.log(data + (object ? ((object.constructor === Object) ? JSON.stringify(object) : object) : ""));
    console.log("======================================================================");
}
Logs.prototype.WriteLog_new = function WriteLog_new(MessageData, MessageObject, MessageSource) {
    //WriteToConsole_local(MessageData, MessageObject);
    WriteToFile_new(MessageData, MessageObject, MessageSource);
}
function WriteToFile_new(data, object, source) {
    if (object && object.constructor === Object) {
        object = JSON.stringify(object);
    }
    var filePath = logPath;
    var today = new Date();
    var date = moment(today, 'DD-MM-YYYY').format('DD-MM-YYYY');
    filePath = filePath + date + "_" + source + ".ctsLog";
    file.appendFile(filePath, data + "=" + object + "\n", function (err) { });
}
module.exports = new Logs;
