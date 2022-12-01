const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const ds = require('../datastore');
const boatsController = require('./boatsController');
const authController = require('./authController');

const datastore = ds.datastore;

const LOAD = "Load";
const PAGELIMIT = 5;

router.use(bodyParser.json());


/* ------------- Begin Datastore Model Functions ------------- */

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
function put_load(volume, item, creation_date, carrier=null, ownerId, id=null){

    let key;

    if(id === null){
        key = datastore.key(LOAD);
    }
    else{
        key = datastore.key([LOAD, parseInt(id, 10)]);
    }
    
	const new_load = {"volume": volume, "item": item, "creation_date": creation_date, "carrier": carrier, "owner_id": ownerId};
	return datastore.save({"key":key, "data":new_load}).then(() => {return key});
}

/**
 * Will Update the load item to have the carrier field with null.
 */
async function remove_carrier(load){
    const results = await get_load(load.id);
    const new_load = results[0];

    if(new_load !== undefined || new_load !== null){
        await put_load(new_load.volume, new_load.item, new_load.creation_date, null, new_load.owner_id, new_load.id);
    }
    return;
}

/**
 * Returns an Object with pagination results for any entity/Kind. */
function get_entity(req, KIND, ownerId){
    var q = datastore.createQuery(KIND).limit(PAGELIMIT).filter('owner_id', '=', ownerId);
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

/**
 * 
 * @param req - request object
 * @param res - response object
 * @returns [bool, null/ownerId] 
 * If the request is valid an array with index 0 of true is returned, 
 * along with the ownerId of the validated individual in index 1. 
 * Otherwise index 0 is false and index 1 is null.
 */
async function is_valid_request(req, res){

    // Checks to see if client can accept JSON as a response.
    const accepts = req.accepts('application/json');
    if(!accepts){
        res.status(406).json({"Error": "Not Acceptable"});
        return [false, null];
    }

    // Check for authorization header
    if(req.headers?.authorization === undefined || req.headers?.authorization === null){
        res.status(401).json( {"Error": "No authorization bearer token was provided!"});
        return [false, null];
    }

    // Split makes an array of the words bearer and the tokenId itself. 
    const tokenId = req.headers.authorization.split(" ")[1];

    const [isValid, ownerId, errorMessage] = await authController.verify(tokenId);

    // A failed verification will return 401 status and the error message.
    if(!isValid){
        res.status(401).json( {"Error": errorMessage} );
        return [false, null]
    }
    
    return [true, ownerId]
}

/* ------------- Begin Controller Functions ------------- */

/**
 * Gets all Loads with Pagination. */
router.get('/', async function(req, res){

    const [is_valid, ownerId] = await is_valid_request(req, res);

    // Invalid requests are terminated.
    if(!is_valid){
        return;
    }

    get_entity(req, LOAD, ownerId)
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
                const loads = [];
                // Only loads that match the owner are added.
                for(const load of allLoads.items){
                    if(load.owner_id === ownerId){
                        loads.push(load);
                    }
                }
                returnObj.loads = loads;
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
 router.get('/:id', async function (req, res){

    const [is_valid, ownerId] = await is_valid_request(req, res);

    // Invalid requests are terminated.
    if(!is_valid){
        return;
    }

    get_load(req.params.id)
        .then(load => {
            if (load[0] === undefined || load[0] === null) {
                // The 0th element is undefined. This means there is no load with this id
                res.status(404).json({ 'Error': 'No load with this load_id exists' });
            } 
            else {
                
                // Prevent different owners from handle loads they don't own.
                if(load[0].owner_id !== ownerId){
                    return res.status(403).json({ 'Error': 'Forbidden Access!' });
                }
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
 router.post('/', async function(req, res){

    const [is_valid, ownerId] = await is_valid_request(req, res);

    // Invalid requests are terminated.
    if(!is_valid){
        return;
    }

    if(req.body?.volume === undefined || req.body?.item === undefined || req.body?.creation_date === undefined ||
        req.body?.volume === null || req.body?.item === null || req.body?.creation_date === null){
        return res.status(400).json( {"Error": "The request object is missing at least one of the required attributes"});
    }

    put_load(req.body.volume, req.body.item, req.body.creation_date, null, ownerId)
    .then( key => {res.status(201)
        .send({
            "id": key.id,
            "volume": req.body.volume,
            "item": req.body.item,
            "creation_date": req.body.creation_date,
            "carrier": null,
            "owner_id": ownerId,
            "self": req.protocol + "://" + req.get('host') + req.baseUrl + "/" + key.id
        })
    });
});

/**
 * Update a Load */ 
 router.patch('/:load_id', async function(req, res){

    const [is_valid, ownerId] = await is_valid_request(req, res);

    // Invalid requests are terminated.
    if(!is_valid){
        return;
    }

    let attributeNum = 0;
    let [volume, item, creation_date] = [null, null, null];

    // Getting the volume if not undefined or null
    if(req.body?.volume !== undefined && req.body?.volume !== null){
        volume = req.body.volume;
        attributeNum++;
    }

    // Getting the item if not undefined or null
    if(req.body?.item !== undefined && req.body?.item !== null){
        item = req.body.item;
        attributeNum++;
    }

    // Getting the creation_date if not undefined or null
    if(req.body?.creation_date !== undefined && req.body?.creation_date !== null){
        creation_date = req.body.creation_date;
        attributeNum++;
    }

    // If no attributes are added, error is returned. 
    if(attributeNum <= 0){
        return res.status(400).json( {"Error": "The request object is missing at least one of the required attributes"});
    }

    const requestedLoad = await get_load(req.params.load_id);

    // check for valid load. 
    if (requestedLoad?.[0] === undefined || requestedLoad?.[0] === null){

        // The 0th element is undefined. This means there is no Load with this id
        return res.status(404).json({ 'Error': 'No load with this load_id exists' });
    } 

    // Prevents One user from accessing another user's load. -- Implement in Postman
    if(requestedLoad[0]?.owner_id !== ownerId){
        return res.status(403).json({ 'Error': 'Forbidden Access!' });
    }

    // Attributes that are null are replaced by original values. 
    if(volume === null){
        volume = requestedLoad[0].volume;
    }
    if(item === null){
        item = requestedLoad[0].item;
    }
    if(creation_date === null){
        creation_date = requestedLoad[0].creation_date;
    }

    put_load(volume, item, creation_date, requestedLoad[0].carrier, ownerId, req.params.load_id)
    .then( key => {res.status(200)
        .send({
            "id": key.id,
            "volume": volume,
            "item": item,
            "creation_date": creation_date,
            "carrier": requestedLoad[0].carrier,
            "owner_id": ownerId,
            "self": req.protocol + "://" + req.get('host') + req.baseUrl + "/" + key.id
        })
    });

});

/**
 * Delete a Load. */
 router.delete('/:load_id', async function(req, res){ 

    const [is_valid, ownerId] = await is_valid_request(req, res);

    // Invalid requests are terminated.
    if(!is_valid){
        return;
    }
    
    // Get load based on their respective ids. 
    const load = await get_load(req.params.load_id);
    
    // Checks for load Existence 
    if(load[0]?.id === undefined || load[0]?.id === null){
        res.status(404).json({"Error": "No load with this load_id exists"});
        return;
    }
    // Check if owner is authorized.
    if(load[0].owner_id !== ownerId){
        return res.status(403).json({ 'Error': 'Forbidden Access!' });
    }

    const promiseArr = [];

    if(load[0].carrier?.id !== undefined && load[0].carrier?.id !== null){

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
module.exports.is_valid_request = is_valid_request;
