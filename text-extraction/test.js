var hummus = require('hummus');
var _ = require('lodash');
var extractText = require('./text-extraction');

function runMe() {
    var pdfReader = hummus.createReader('./samples/HighLevelContentContext.PDF');
    
    var {pagesPlacements,formsPlacements} = extractText(pdfReader);

    function placementToDisplay(objectPlacements) {
        return _.map(objectPlacements,
                (placement)=> {
                    if(placement.type === 'text')
                        return _.map(placement.text,(item)=> {return _.isArray(item.text) ? (_.map(item.text,(TJItem)=>{return TJItem.asText || TJItem})) : item.text.asText});
                    else 
                        return placement.objectId;
                });
    }

    console.log('pages text placements',JSON.stringify(_.map(pagesPlacements,placementToDisplay),null,2));
    console.log('forms text Placements',JSON.stringify(_.mapValues(formsPlacements,placementToDisplay),null,2));
}

runMe();

