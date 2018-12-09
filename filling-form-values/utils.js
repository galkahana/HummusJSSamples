var _ = require('lodash')

var BUFFER_SIZE = 10000;
function readStreamToString(handles,stream) {
    var buff = '';
    var readStream = handles.reader.startReadingFromStream(stream);
    while(readStream.notEnded())
    {
      var readData = readStream.read(BUFFER_SIZE);
      buff+= _.reduce(readData,function(acc,item){ return acc + String.fromCharCode(item)},'');
    }

    return buff;
}

/**
 * a wonderfully reusable method to recreate a dict without all the keys that we want to change
 * note that it starts writing a dict, but doesn't finish it. your job
 */
function startModifiedDictionary(handles,originalDict,excludedKeys) {
    var originalDictJs = originalDict.toJSObject();
    var newDict = handles.objectsContext.startDictionary();

    Object.getOwnPropertyNames(originalDictJs).forEach(function(element,index,array) {
        if (!excludedKeys[element]) {
            newDict.writeKey(element);
            handles.copyingContext.copyDirectObjectAsIs(originalDictJs[element]);
        }
    });

    return newDict;
}


function writeToStreamCxt(streamCxt,str) {
    var bytes = [];
    for (var i = 0; i < str.length; ++i) {
      var code = str.charCodeAt(i);
      bytes = bytes.concat([code]);
    }
    streamCxt.getWriteStream().write(bytes)
}

module.exports = {
    readStreamToString: readStreamToString,
    startModifiedDictionary: startModifiedDictionary,
    writeToStreamCxt: writeToStreamCxt
}