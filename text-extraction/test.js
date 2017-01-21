var hummus = require('hummus');
var extractPlacements = require('./PlacementsExtraction');

function collectPlacements(resources,placements,formsUsed) {
    return (operatorName,operands)=> {
        switch(operatorName) {
            case 'Do': {
                // add placement, if form, and mark for later inspection
                if(resources.forms[operands[0].value]) {
                    placements.push({type:'xobject',objectId:resources.forms[operands[0].value].id});

                    // add for later inspection (helping the extraction method a bit..[can i factor out? interesting enough?])
                    formsUsed[resources.forms[operands[0].value].id] = resources.forms[operands[0].value].xobject;
                }
            }
        }
    };
}

function runMe() {
    var pdfReader = hummus.createReader('./samples/XObjectContent.PDF');
    
    var {pagesPlacements,formsPlacements} = extractPlacements(pdfReader,collectPlacements);

    console.log('pages placements',pagesPlacements);
    console.log('formsPlacements',formsPlacements);
}

runMe();

