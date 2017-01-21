var hummus = require('hummus');
var _ = require('lodash');
var extractText = require('./text-extraction');

function placementToDisplay(objectPlacements) {
    return _.map(objectPlacements,
            (placement)=> {
                if(placement.type === 'text')
                    return _.map(placement.text,(item)=> {return {text:item.text.asText/*,bytes:item.text.asBytes*/,font:item.textState.font};});
                else 
                    return placement.objectId;
            });
}

function runMe() {
    var pdfReader = hummus.createReader('./samples/HighLevelContentContext.PDF');
    
    var {pagesPlacements,formsPlacements} = extractText(pdfReader);

    console.log('pages text placements',JSON.stringify(_.map(pagesPlacements,placementToDisplay),null,2));
    console.log('forms text Placements',JSON.stringify(_.mapValues(formsPlacements,placementToDisplay),null,2));
}

runMe();

