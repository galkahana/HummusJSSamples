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
    console.log('stream content',result);
}

function interpretContentStream(pdfReader,contentStream,onOperatorHandler, operandStackInit) {
    //debugStream(pdfReader,contentStream);
    
    var objectParser = pdfReader.startReadingObjectsFromStream(contentStream);
        
    var operandsStack = operandStackInit || [];
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
    return  operandsStack;
}

PDFInterpreter.prototype.interpretPageContents = function(pdfReader,pageObject,onOperatorHandler) {
    pageObject = pageObject.toPDFDictionary();
    var contents = pageObject.exists('Contents') ? pdfReader.queryDictionaryObject(pageObject,('Contents')):null;
    if(!contents)
        return;

    if(contents.getType() === hummus.ePDFObjectArray) {
        var contentsArray = contents.toPDFArray();
        var carriedOperandsStack = [];
        
        for(var i=0;i<contentsArray.getLength();++i) {
            carriedOperandsStack = interpretContentStream(pdfReader,pdfReader.queryArrayObject(contentsArray,i).toPDFStream(),onOperatorHandler,carriedOperandsStack);
        }
    }
    else {
        interpretContentStream(pdfReader,contents.toPDFStream(),onOperatorHandler);
    }    
}

PDFInterpreter.prototype.interpretXObjectContents = function(pdfReader,xobjectObject,onOperatorHandler) {
    interpretContentStream(pdfReader,xobjectObject.toPDFStream(),onOperatorHandler);
}

PDFInterpreter.prototype.interpretStream = function(pdfReader,stream,onOperatorHandler) {
    interpretContentStream(pdfReader,stream,onOperatorHandler)
}

module.exports = PDFInterpreter;