var hummus = require('hummus');
var _ = require('lodash');
var extractText = require('./lib/text-extraction');

function runMe() {
    var fileToRun = './samples/HighLevelContentContext.pdf';
    var pdfReader = hummus.createReader(fileToRun);

    // extract text for all pages
    // will return array matching pages array where each item is an array of text placements
    // each text placements is represented by an object which has the following structure:
    // {
    //      text: the text
    //      matrix: 6 numbers pdf matrix describing how the text is transformed in relation to the page (this includes position - translation)
    //      localBBox: 4 numbers box describing the text bounding box, before being transformed by matrix.
    //      globalBBox: 4 numbers box describing the text bounding box after transoformation, making it the bbox in relation to the page.
    // }
    var pagesPlacements = extractText(pdfReader);
    
    // flush the result
    console.log('pages text placements',JSON.stringify(pagesPlacements,null,2));

    // create new version of file with rectangles around the text based on extraction info
    // if it is correct will have red rectangles around every piece of text
    var pdfWriter = hummus.createWriterToModify(fileToRun,{modifiedFilePath:'./samples/test_out.pdf'});
    for(var i=0;i<pagesPlacements.length;++i) {
        var pageModifier = new hummus.PDFPageModifier(pdfWriter,i);
		var cxt = pageModifier.startContext().getContext();
        pagesPlacements[i].forEach((placement)=> {
            cxt.q();
            cxt.cm.apply(cxt,placement.matrix);
            cxt.drawRectangle(placement.localBBox[0],placement.localBBox[1],placement.localBBox[2]-placement.localBBox[0],placement.localBBox[3]-placement.localBBox[1],{color:'Red',width:1});
            cxt.Q();
        });
		pageModifier.endContext().writePage();
    }
    pdfWriter.end();
}

runMe();

