const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const ds = require('../datastore');
const boatsController = require('./boatsController');

const datastore = ds.datastore;

const LOAD = "Load";
const PAGELIMIT = 3;

router.use(bodyParser.json());


/* ------------- Begin guest Model Functions ------------- */

/**
 * Returns a load with a given id. */
function get_load(id) {
    const key = datastore.key([LOAD, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            // No entity found. Don't try to add the id attribute
            return entity;
        } else {
            // Use Array.map to call the function fromDatastore. This function
            // adds id attribute to every element in the array entity
            return entity.map(ds.fromDatastore);
        }
    });
}

/**
 * Puts the load to the Datastore Database. If no id is provided a new
 * load id is generated.  */
function put_load(volume, item, creation_date, carrier=null, id=null){

    let key;

    if(id === null){
        key = datastore.key(LOAD);
    }
    else{
        key = datastore.key([LOAD, parseInt(id, 10)]);
    }
    
	const new_load = {"volume": volume, "item": item, "creation_date": creation_date, "carrier": carrier};
	return datastore.save({"key":key, "data":new_load}).then(() => {return key});
}

/**
 * Will Update the load item to have the carrier field with null.
 */
async function remove_carrier(load){
    const results = await get_load(load.id);
    const new_load = results[0];

    if(new_load !== undefined || new_load !== null){
        await put_load(new_load.volume, new_load.item, new_load.creation_date, null, new_load.id);
    }
    return;
}

/**
 * Returns an Object with pagination results for any entity/Kind. */
function get_entity(req, KIND){
    var q = datastore.createQuery(KIND).limit(PAGELIMIT);
    const results = {};
    var prev;
    if(Object.keys(req.query).includes("cursor")){
        prev = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + req.query.cursor;
        q = q.start(req.query.cursor);
    }
	return datastore.runQuery(q).then( (entities) => {
            results.items = entities[0].map(ds.fromDatastore);
            if(typeof prev !== 'undefined'){
                results.previous = prev;
            }
            if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS ){
                results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + encodeURIComponent(entities[1].endCursor);
            }
			return results;
		});
}

/**
 * Deletes a load with the given id. */
function delete_load(id){
    const key = datastore.key([LOAD, parseInt(id,10)]);
    return datastore.delete(key);
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

/**
 * Gets all Loads with Pagination. */
router.get('/', function(req, res){
    get_entity(req, LOAD)
	.then( (allLoads) => {
        
        // console.log(allLoads);

        allLoads.items.forEach(load => {
            
            // Also creates self link when responding to client. 
            load.self = req.protocol + "://" + req.get('host') + req.baseUrl + "/" + load.id
            // Creates self reference for carriers. 
            if(load?.carrier !== undefined && load?.carrier !== null){
                load.carrier.self = req.protocol + "://" + req.get('host') + "/boats" + "/" + load.carrier.id;
            }
        });

        const returnObj = {};

        // Copy into new object where items is replaced by loads. 
        Object.keys(allLoads).forEach(key => {
            if (key === 'items'){
                returnObj.loads = allLoads[key];
            }
            else{
                returnObj[key] = allLoads[key];
            }
        })

        res.status(200).json( returnObj );
    });
});

/**
 * Gets a Load with given ID. */
 router.get('/:id', function (req, res){
    get_load(req.params.id)
        .then(load => {
            if (load[0] === undefined || load[0] === null) {
                // The 0th element is undefined. This means there is no load with this id
                res.status(404).json({ 'Error': 'No load with this load_id exists' });
            } else {
                // Return the 0th element which is the load with this id
                // Also creates self link when responding to client. 
                load[0].self = req.protocol + "://" + req.get('host') + req.baseUrl + "/" + req.params.id
                // Creates self reference for carriers. 
                if(load[0]?.carrier !== undefined && load[0]?.carrier !== null){
                    load[0].carrier.self = req.protocol + "://" + req.get('host') + "/boats" + "/" + load[0].carrier.id;
                }
                
                res.status(200).json(load[0]);
            }
        });
});

/**
 * Add a Load */ 
 router.post('/', function(req, res){

    if(req.body?.volume === undefined || req.body?.item === undefined || req.body?.creation_date === undefined){
        return res.status(400).json( {"Error": "The request object is missing at least one of the required attributes"});
    }

    put_load(req.body.volume, req.body.item, req.body.creation_date)
    .then( key => {res.status(201)
        .send({
            "id": key.id,
            "volume": req.body.volume,
            "item": req.body.item,
            "creation_date": req.body.creation_date,
            "carrier": null,
            "self": req.protocol + "://" + req.get('host') + req.baseUrl + "/" + key.id
        })
    });
});

/**
 * Delete a Load. */
 router.delete('/:load_id', async function(req, res){ 
    
    // Get load based on their respective ids. 
    const load = await get_load(req.params.load_id);
    
    // Checks for load Existence 
    if(load[0]?.id === undefined || load[0]?.id === null){
        res.status(404).json({"Error": "No load with this load_id exists"});
        return;
    }

    const promiseArr = [];

    if(load[0].carrier?.id !== undefined){

        const boat = await boatsController.get_boat(load[0].carrier.id);

        // Checks for boat Existence & removes load from it. 
        if(boat[0]?.id !== undefined && boat[0]?.id !== null){
            promiseArr.push(boatsController.remove_load(boat[0], load[0]));    
        }
    }
    
    // Delete load from Datastore.
    promiseArr.push(delete_load(load[0].id));

    // Completes promises: deleting load, and removing from boat if currently loaded. 
    await Promise.all(promiseArr)
    .then(
        res.status(204).send()
    );
});

/* ------------- End Controller Functions ------------- */

module.exports = router;

/* ------------- Exported Functions ------------- */
module.exports.get_load = get_load;
module.exports.put_load = put_load;
module.exports.delete_load = delete_load;
module.exports.remove_carrier = remove_carrier;
module.exports.get_entity = get_entity;