var hummus = require('hummus');
var _ = require('lodash');
var extractText = require('./text-extraction');

function runMe() {
    var pdfReader = hummus.createReader('./samples/XObjectContent.PDF');
    
    var {pagesPlacements,formsPlacements} = extractText(pdfReader);

    console.log('pages text placements',_.map(
                                                pagesPlacements,(pagePlacements)=>{
                                                    return _.map(pagePlacements,
                                                            (placement)=> {
                                                                if(placement.type === 'text')
                                                                    return _.map(placement.text,'text.asText');
                                                                else 
                                                                    return placement.objectId;
                                                            })
                                                        }
                                            ));
    console.log('forms text Placements',_.mapValues(
                                                formsPlacements,(formPlacements)=>{
                                                    return _.map(
                                                            _.filter(formPlacements,{type:'text'}),
                                                           (placement)=> {
                                                                if(placement.type === 'text')
                                                                    return _.map(placement.text,'text.asText');
                                                                else 
                                                                    return placement.objectId;
                                                            })
                                                        }
                                            ));
}

runMe();

