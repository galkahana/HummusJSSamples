var hummus = require('hummus');
var _ = require('lodash');
function PDFInterpreter() {

}

function debugStream(pdfReader,contentStream) {
    var readStream = pdfReader.startReadingFromStream(contentStream);
    var result = '';
    while(readStream.notEnded())
    {
        var readData = readStream.read(10000);
        result+=String.fromCharCode.apply(String,readData);
    }    
    console.log('-----------------stream content------------------');
    console.log(result);
}

function interpretContentStream(objectParser,onOperatorHandler) {
        
    var operandsStack = [];
    var anObject = objectParser.parseNewObject();
    
    while(!!anObject) {
        if(anObject.getType() === hummus.ePDFObjectSymbol) {
            // operator!
            onOperatorHandler(anObject.value,operandsStack.concat());
            operandsStack = [];
        }
        else {
            // operand!
            operandsStack.push(anObject);
        }
        anObject = objectParser.parseNewObject();
    }   
}

PDFInterpreter.prototype.interpretPageContents = function(pdfReader,pageObject,onOperatorHandler) {
    pageObject = pageObject.toPDFDictionary();
    var contents = pageObject.exists('Contents') ? pdfReader.queryDictionaryObject(pageObject,('Contents')):null;
    if(!contents)
        return;

    if(contents.getType() === hummus.ePDFObjectArray) {
        interpretContentStream(pdfReader.startReadingObjectsFromStreams(contents.toPDFArray()),onOperatorHandler);
    }
    else {
        interpretContentStream(pdfReader.startReadingObjectsFromStream(contents.toPDFStream()),onOperatorHandler);
    }    
}

PDFInterpreter.prototype.interpretXObjectContents = function(pdfReader,xobjectObject,onOperatorHandler) {
    interpretContentStream(pdfReader.startReadingObjectsFromStream(xobjectObject.toPDFStream()),onOperatorHandler);
}

PDFInterpreter.prototype.interpretStream = function(pdfReader,stream,onOperatorHandler) {
    interpretContentStream(pdfReader.startReadingObjectsFromStream(stream),onOperatorHandler);
}

module.exports = PDFInterpreter;