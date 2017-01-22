var _ = require('lodash');
var PDFInterpreter = require('./pdf-interpreter');

function besToUnicodes(inArray) {
    var i=0;
    var unicodes = [];

    while(i<inArray.length) {
        var newOne = beToNum(inArray,i,i+2);
        if(0xD800 <= newOne && newOne <= 0xDBFF) {
            // pfff. high surrogate. need to read another one
            i+=2;
            var lowSurrogate =  beToNum(inArray,i,i+2);
            unicodes.push(0x10000 + ((newOne - 0xD800) << 10) + (lowSurrogate - 0xDC00));
        }
        else {
            unicodes.push(newOne);
        }
        i+=2;
    }
    
    return unicodes;
}

function beToNum(inArray,start,end) {
    var result = 0;
    start = start || 0;
    if(end === undefined) {
        end = inArray.length;
    }

    for(var i=start;i<end;++i) {
        result = result*256 + inArray[i];
    }
    return result;
}

function parseToUnicode(pdfReader,toUnicodeObjectId) {
    var map = {};
    // yessss! to unicode map. we can read it rather nicely
    // with the interpreter class looking only for endbfrange and endbfchar as "operands"
    var interpreter = new PDFInterpreter();
    var stream = pdfReader.parseNewObject(toUnicodeObjectId).toPDFStream();
    if(!stream)
        return null;

    interpreter.interpretStream(pdfReader,stream, (operatorName,operands)=> {
        if(operatorName === 'endbfchar') {
            // Operators are pairs. always of the form <codeByte> <unicodes>
            for(var i=0;i<operands.length;i+=2) {
                var byteCode = operands[i].toBytesArray();
                var unicodes = operands[i+1].toBytesArray();
                map[beToNum(byteCode)] = besToUnicodes(unicodes);
            }
        }
        else if(operatorName === 'endbfrange') {
            // Operators are 3. two codesBytes and then either a unicode start range or array of unicodes
            for(var i=0;i<operands.length;i+=3) {
                var startCode = operands[i].toBytesArray();
                var endCode = operands[i+1].toBytesArray();
                
                if(operands[i+2].getType() === hummus.ePDFArray) {
                    var unicodeArray = operands[i+2].toPDFArray();
                    // specific codes
                    for(var j = startCode;j<=endCode;++j) {
                        map[j] = besToUnicodes(unicodeArray.queryObject(j).toBytesArray());
                    }
                }
                else {
                    var unicodes =  besToUnicodes(operands[i+2].toBytesArray())
                    // code range
                    for(var j = startCode;j<=endCode;++j) {
                        map[j] = unicodes.slice();
                        // increment last unicode value
                        ++unicodes[unicodes.length-1];
                    }
                }

            }            
        }
    });

    return map;
}


function parseFontData(self,pdfReader,fontObjectId) {
    var font = pdfReader.parseNewObject(fontObjectId).toPDFDictionary();
    if(!font)
        return;

    self.isSimpleFont = font.queryObject('Subtype').value !== 'Type0';

    if(font.exists('ToUnicode')) {
        self.hasToUnicode = true;
        self.toUnicodeMap = parseToUnicode(pdfReader,font.queryObject('ToUnicode').toPDFIndirectObjectReference().getObjectID());
    }
}


function toUnicodeEncoding(toUnicodeMap,bytes) {
    var result = '';

    bytes.forEach((aByte)=> {
        result+= String.fromCharCode.apply(String,toUnicodeMap[aByte]);
    });

    return result;
}

function defaultEncoding(bytes) {
    return String.fromCharCode.apply(String,bytes);
}


function FontDecoding(pdfReader,fontObjectId) {
    parseFontData(this,pdfReader,fontObjectId);
}

FontDecoding.prototype.translate = function(encodedBytes) {
    if(this.hasToUnicode) {
        return toUnicodeEncoding(this.toUnicodeMap,encodedBytes);
    }
    else {
        return defaultEncoding(encodedBytes);
    }
}

module.exports = FontDecoding;