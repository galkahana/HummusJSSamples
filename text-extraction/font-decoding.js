var hummus = require('hummus');
var _ = require('lodash');
var PDFInterpreter = require('./pdf-interpreter');
var WinAnsiEncoding = require('./encoding/win-ansi-encoding');
var MacExpertEncoding = require('./encoding/mac-expert-encoding');
var MacRomanEncoding = require('./encoding/mac-roman-encoding');
var StandardEncoding = require('./encoding/standard-encoding');
var SymbolEncoding = require('./encoding/symbol-encoding');
var AdobeGlyphList = require('./encoding/adobe-glyph-list');

function toUnsignedCharsArray(charsArray) {
    return _.map(charsArray,(char)=> {return char < 0 ? (char+256):char})
}

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
                var byteCode = toUnsignedCharsArray(operands[i].toBytesArray());
                var unicodes = toUnsignedCharsArray(operands[i+1].toBytesArray());
                map[beToNum(byteCode)] = besToUnicodes(unicodes);
            }
        }
        else if(operatorName === 'endbfrange') {
            
            // Operators are 3. two codesBytes and then either a unicode start range or array of unicodes
            for(var i=0;i<operands.length;i+=3) {
                var startCode = beToNum(toUnsignedCharsArray(operands[i].toBytesArray()));
                var endCode = beToNum(toUnsignedCharsArray(operands[i+1].toBytesArray()));
                
                if(operands[i+2].getType() === hummus.ePDFArray) {
                    var unicodeArray = operands[i+2].toPDFArray();
                    // specific codes
                    for(var j = startCode;j<=endCode;++j) {
                        map[j] = besToUnicodes(toUnsignedCharsArray(unicodeArray.queryObject(j).toBytesArray()));
                    }
                }
                else {
                    var unicodes =  besToUnicodes(toUnsignedCharsArray(operands[i+2].toBytesArray()));
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



function getStandardEncodingMap(encodingName) {
    // MacRomanEncoding, MacExpertEncoding, or WinAnsiEncoding
    if(encodingName === 'WinAnsiEncoding') {
        return WinAnsiEncoding;
    }

    if(encodingName === 'MacExpertEncoding')
        return MacExpertEncoding;

    if(encodingName === 'MacRomanEncoding')
        return MacRomanEncoding;

    return null; 
}

function setupDifferencesEncodingMap(pdfReader,font, encodingDict) {
    // k. got ourselves differences array. let's see.
    var newEncoding = null;
    if(encodingDict.exists('BaseEncoding')) {
        var baseEconding = getStandardEncodingMap(pdfReader.queryDictionaryObject(encodingDict,'BaseEncoding').value);
        if(baseEncoding) {
            newEncoding = _.extend({},baseEconding);
        }
    }

    if(!newEncoding) {
        // no base encoding. use standard or symbol. i'm gonna use either standard encoding or symbol encoding.
        // i know the right thing is to check first the font native encoding...but that's too much of a hassle
        // so i'll take the shortcut and if it is ever a problem - improve
        var fontDescriptor = font.exists('FontDescriptor') ? pdfReader.queryDictionaryObject(font,'FontDescriptor').toPDFDictionary():null;
        if(fontDescriptor) {
            // check font descriptor to determine whether this is a symbolic font. if so, use symbol encoding. otherwise - standard
            var flags = pdfReader.queryDictionaryObject(fontDescriptor,'Flags').value;
            if(flags & (1<<2)) {
                newEncoding = _.extend({},SymbolEncoding);
            }
            else {
                newEncoding = _.extend({},StandardEncoding);
            }
        }
        else {
            // assume standard
            newEncoding = _.extend({},StandardEncoding);
        }
    }

    // now apply differences
    if(encodingDict.exists('Differences')) {
        var differences = pdfReader.queryDictionaryObject(encodingDict,('Differences')).toPDFArray().toJSArray();
        var i=0;
        while(i<differences.length) {
            // first item is always a number
            var firstIndex = differences[i].value;            
            ++i;
            // now come names, one for each index
            while(i<differences.length && differences[i].getType() === hummus.ePDFObjectName) {
                newEncoding[firstIndex] = differences[i].value;
                ++i;
                ++firstIndex;
            }
        }
    }

    return newEncoding;
}

function parseSimpleFontEncoding(self,pdfReader,font, encoding) {
    if(encoding.getType() === hummus.ePDFObjectName) {
        self.fromSimpleEncodingMap = getStandardEncodingMap(encoding.value);
        self.hasSimpleEncoding = true;
    }
    else if(encoding.getType() === hummus.ePDFObjectIndirectObjectReference || encoding.getType() === hummus.ePDFObjectDictionary) {
        // make sure we have a dict here
        encoding = (encoding.getType() === hummus.ePDFObjectIndirectObjectReference) ? pdfReader.parseNewObject(encoding.toPDFIndirectObjectReference().getObjectID()):encoding;
        // now figure it out
        self.fromSimpleEncodingMap = setupDifferencesEncodingMap(pdfReader,font, encoding);
        self.hasSimpleEncoding = true;
    }
}

function parseFontData(self,pdfReader,fontObjectId) {
    var font = pdfReader.parseNewObject(fontObjectId).toPDFDictionary();
    if(!font)
        return;

    self.isSimpleFont = font.queryObject('Subtype').value !== 'Type0';

    if(font.exists('ToUnicode')) {
        self.hasToUnicode = true;
        self.toUnicodeMap = parseToUnicode(pdfReader,font.queryObject('ToUnicode').toPDFIndirectObjectReference().getObjectID());
        // if there's toUnicode there's no need to obtain more info. it is the default anyways
        return;
    }

    // otherwise. try encoding
    if(self.isSimpleFont) {
        if(font.exists('Encoding'))
            parseSimpleFontEncoding(self,pdfReader,font, font.queryObject('Encoding'));
    }

}


function toUnicodeEncoding(toUnicodeMap,bytes) {
    var result = '';

        var i=0;
        while(i<bytes.length) {
            var value = bytes[i];
            i+=1;
            while(i<bytes.length && (toUnicodeMap[value] === undefined)) {
                value = value*256 + bytes[i];
                i+=1;
            }
            result+= String.fromCharCode.apply(String,toUnicodeMap[value]);
        }
    return result;
}

function toSimpleEncoding(encodingMap,encodedBytes) {
    var result = '';

    encodedBytes.forEach((encodedByte)=> {
        var glyphName = encodingMap[encodedByte];
        if(!!glyphName) {
            var mapping = AdobeGlyphList[glyphName];
            if(!_.isArray(mapping)) {
                mapping = [mapping];
            }
            result+= String.fromCharCode.apply(String,mapping);
        }
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
        return {result:toUnicodeEncoding(this.toUnicodeMap,encodedBytes),method:'toUnicode'};
    }
    else if(this.hasSimpleEncoding) {
        return {result:toSimpleEncoding(this.fromSimpleEncodingMap,encodedBytes),method:'simpleEncoding'};
    }
    else {
        return {result:defaultEncoding(encodedBytes),method:'default'};
    }
}

module.exports = FontDecoding;