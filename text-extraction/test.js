var hummus = require('hummus');
var _ = require('lodash');
var extractText = require('./text-extraction');

function runMe() {
    var pdfReader = hummus.createReader('./samples/HighLevelContentContext.PDF');
    
    var {pagesPlacements,formsPlacements} = extractText(pdfReader);

    function itemDisplay(item) {
        if(item.translationMethod === 'default' || !item.asText) {
            return item;
        }
        else
            return item.asText;
    }

    function isItemMaybeProblem(item) {
        return item.translationMethod === 'default' || !item.asText;
    }

    function maybeProblem(item) {
         return _.isArray(item.text) ? 
            _.some(item.text,(TJItem)=>{
                    return _.isObject(TJItem) ? isItemMaybeProblem(TJItem):false
            }) : 
            isItemMaybeProblem(item.text);
    }

    function placementToDisplay(objectPlacements) {
        return _.map(objectPlacements,
                (placement)=> {
                    if(placement.type === 'text') {
                        return _.map(placement.text,(item)=> {
                                if(maybeProblem(item)) {
                                    return item;
                                }
                                else {
                                    return _.isArray(item.text) ? 
                                                _.map(item.text,(TJItem)=>{
                                                        return _.isObject(TJItem) ? itemDisplay(TJItem):TJItem
                                                }) : 
                                                itemDisplay(item.text)
                        }});
                    } else {
                        return placement.objectId;
                    }
                });
    }

    console.log('pages text placements',JSON.stringify(_.map(pagesPlacements,placementToDisplay),null,2));
    console.log('forms text Placements',JSON.stringify(_.mapValues(formsPlacements,placementToDisplay),null,2));
}

runMe();

