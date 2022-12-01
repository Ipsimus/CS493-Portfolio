const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const ds = require('../datastore');
const loadsController = require('./loadsController');
const authController = require('./authController');
const { auth } = require('googleapis/build/src/apis/abusiveexperiencereport');

const datastore = ds.datastore;
const BOAT = "Boat";

router.use(bodyParser.json());



/* ------------- Begin Lodging Model Functions ------------- */
function get_boat(id) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
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
 * Puts a boat, if an id isn't provided it generates a boat id from datastore. 
 */
function put_boat(name, type, length, loads=[], ownerId, id=null){
    
    let key;

    if(id === null){
        key = datastore.key(BOAT);
    }
    else{
        key = datastore.key([BOAT, parseInt(id, 10)]);
    }
    
	const new_boat = {"name": name, "type": type, "length": length, "loads": loads, "owner_id": ownerId};
	return datastore.save({"key":key, "data":new_boat}).then(() => {return key});
}

/**
 * Removes the load from the boat.
 */
async function remove_load(boat, load){

    const new_loads = [];

    for(const aLoad of boat.loads){
        if(aLoad.id !== load.id){
            new_loads.push(aLoad)
        }
    }

    return await put_boat(boat.name, boat.type, boat.length, new_loads, boat.owner_id, boat.id);
}

/**
 * Deletes the boat.
 */
function delete_boat(id){
    const key = datastore.key([BOAT, parseInt(id,10)]);
    return datastore.delete(key);
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

/**
 * Gets all Boats with Pagination. */
 router.get('/', async function(req, res){
    
    const [is_valid, ownerId] = await loadsController.is_valid_request(req, res);

    // Invalid requests are terminated.
    if(!is_valid){
        return;
    }
    
    // Get pagination results object called allBoats. 
    loadsController.get_entity(req, BOAT, ownerId)
	.then( (allBoats) => {
        
        allBoats.items.forEach(boat => {
            
            // Also creates self link when responding to client. 
            boat.self = req.protocol + "://" + req.get('host') + req.baseUrl + "/" + boat.id
            
            // Creates self reference for loads. 
            for(let load of boat.loads){
                load.self = req.protocol + "://" + req.get('host') + "/loads" + "/" + load.id;
            }
        });

        // The return object is a filtered allBoats.
        const returnObj = {}
        // Keys are copied.
        Object.keys(allBoats).forEach(key => {

            // console.log(allBoats)
            //The items key has all the boats stored in it from allBoats.
            if (key === 'items'){

                const boats = [];
                // Only the boats that match the owner are added. 
                for(const boat of allBoats.items){
                    if(boat.owner_id === ownerId){
                        boats.push(boat);
                    }
                }
                returnObj.boats = boats;
            }
            else{
                returnObj[key] = allBoats[key];
            }
        })

        res.status(200).json( returnObj );
    });
});

/**
 * Gets a Boat with given ID. -- Done*/
 router.get('/:boat_id', async function (req, res){

    // Checks to see if client can accept JSON as a response.
    const accepts = req.accepts('application/json');
    if(!accepts){
        return res.status(406).json({"Error": "Not Acceptable"});
    }

    // Check for authorization header
    if(req.headers?.authorization === undefined || req.headers?.authorization === null){
        return res.status(401).json( {"Error": "No authorization bearer token was provided!"});
    }

    // Split makes an array of the words bearer and the tokenId itself. 
    const tokenId = req.headers.authorization.split(" ")[1];

    let [isValid, ownerId, errorMessage] = await authController.verify(tokenId);

    // A failed verification will return 401 status and the error message.
    if(!isValid){
        return res.status(401).json( {"Error": errorMessage} );
    }
    
    get_boat(req.params.boat_id)
    .then(boat => {
        if (boat[0] === undefined || boat[0] === null) {
            // The 0th element is undefined. This means there is no boat with this id
            res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
        } 
        else {

            // Prevents One user from accessing another user's boat. -- Implement in Postman
            if(boat[0]?.owner_id !== ownerId){
                return res.status(403).json({ 'Error': 'Forbidden Access!' });
            }
            // Return the 0th element which is the boat with this id
            // Also creates self link when responding to client. 
            boat[0].self = req.protocol + "://" + req.get('host') + req.baseUrl + "/" + req.params.boat_id;
            
            for(let load of boat[0].loads){
                load.self = req.protocol + "://" + req.get('host') + "/loads" + "/" + load.id;
            }

            res.status(200).json(boat[0]);
        }
    });
});

/**
 * Gets all Loads from a Boat with a given ID. */
 router.get('/:id/loads', async function (req, res){
    
    const boat = await get_boat(req.params.id);
    
    if (boat[0] === undefined || boat[0] === null) {
        // The 0th element is undefined. This means there is no boat with this id
        res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
    } else {
        // Return the 0th element which is the boat with this id
        // Also creates self link when responding to client. 
        boat[0].self = req.protocol + "://" + req.get('host') + req.baseUrl + "/" + req.params.id;
        
        const loadsResult = [];

        for(let load of boat[0].loads){
            
            const returnedLoad = await loadsController.get_load(load.id);

            returnedLoad[0].carrier.self = req.protocol + "://" + req.get('host') + req.baseUrl + "/" + returnedLoad[0].carrier.id;
            returnedLoad[0].self = req.protocol + "://" + req.get('host') + "/loads" + "/" + load.id;

            loadsResult.push(returnedLoad[0]);
        }

        res.status(200).json( {"loads": loadsResult} );
    }
    
});

/**
 * Add a Boat -- Done*/ 
router.post('/', async function(req, res){

    let loadsArr = [];

    // Checks to see if client can accept JSON as a response.
    const accepts = req.accepts('application/json');
    if(!accepts){
        return res.status(406).json({"Error": "Not Acceptable"});
    }

    // Check for authorization header
    if(req.headers?.authorization === undefined || req.headers?.authorization === null){
        return res.status(401).json( {"Error": "No authorization bearer token was provided!"});
    }

    if(
        req.body?.name === undefined || req.body?.type === undefined || req.body?.length === undefined ||
        req.body?.name === null || req.body?.type === null || req.body?.length === null){
            return res.status(400).json( {"Error": "The request object is missing at least one of the required attributes"});
    }

    // Split makes an array of the words bearer and the tokenId itself. 
    const tokenId = req.headers.authorization.split(" ")[1];

    let [isValid, ownerId, errorMessage] = await authController.verify(tokenId);

    // A failed verification will return 401 status and the error message.
    if(!isValid){
        return res.status(401).json( {"Error": errorMessage} );
    }

    put_boat(req.body.name, req.body.type, req.body.length, loadsArr, ownerId)
    .then( key => {res.status(201)
        .send({
            "id": key.id,
            "type": req.body.type,
            "name": req.body.name,
            "length": req.body.length,
            "loads": loadsArr,
            "owner_id": ownerId,
            "self": req.protocol + "://" + req.get('host') + req.baseUrl + "/" + key.id
        })
    });
});

/**
 * A Boat is Patched -- Done
 */
router.patch('/:boat_id', async function (req, res){

    // Checks to see if client can accept JSON as a response.
    const accepts = req.accepts('application/json');
    if(!accepts){
        return res.status(406).json({"Error": "Not Acceptable"});
    }

    // Check for authorization header
    if(req.headers?.authorization === undefined || req.headers?.authorization === null){
        return res.status(401).json( {"Error": "No authorization bearer token was provided!"});
    }

    let attributeNum = 0;
    let [name, type, length] = [null, null, null];

    // Getting the name if not undefined or null
    if(req.body?.name !== undefined && req.body?.name !== null){
        name = req.body.name;
        attributeNum++;
    }

    // Getting the type if not undefined or null
    if(req.body?.type !== undefined && req.body?.type !== null){
        type = req.body.type;
        attributeNum++;
    }

    // Getting the length if not undefined or null
    if(req.body?.length !== undefined && req.body?.length !== null){
        length = req.body.length;
        attributeNum++;
    }

    // If no attributes are added, error is returned. 
    if(attributeNum <= 0){
        return res.status(400).json( {"Error": "The request object is missing at least one of the required attributes"});
    }

    // Split makes an array of the words bearer and the tokenId itself. 
    const tokenId = req.headers.authorization.split(" ")[1];

    const [[isValid, ownerId, errorMessage], requestedBoat] = await Promise.all([authController.verify(tokenId), get_boat(req.params.boat_id)])
    // A failed verification will return 401 status and the error message.
    
    if(!isValid){
        return res.status(401).json( {"Error": errorMessage} );
    }

    // check for valid boat. 
    if (requestedBoat?.[0] === undefined || requestedBoat?.[0] === null){

        // The 0th element is undefined. This means there is no boat with this id
        return res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
    } 

    // Prevents One user from accessing another user's boat. -- Implement in Postman
    if(requestedBoat[0]?.owner_id !== ownerId){
        return res.status(403).json({ 'Error': 'Forbidden Access!' });
    }

    const loadsArr = [];
    
    // Copy original boat loads
    for(const load of requestedBoat[0].loads){
        // !!!!! You need to add a self link to all loads represented !!!!!
        loadsArr.push(load);
    }

    // Attributes that are null are replaced by original values. 
    if(name === null){
        name = requestedBoat[0].name;
    }
    if(type === null){
        type = requestedBoat[0].type;
    }
    if(length === null){
        length = requestedBoat[0].length;
    }

    // Patch the boat for all attributes except the loads. 
    put_boat(name, type, length, loadsArr, ownerId, requestedBoat[0].id)
    .then( key => {res.status(200)
        .send({
            "id": key.id,
            "name": name,
            "type": type,
            "length": length,
            "loads": loadsArr,
            "owner_id": ownerId,
            "self": req.protocol + "://" + req.get('host') + req.baseUrl + "/" + key.id
        })
    });
})

/**
 * Load is Assigned to a Boat -- Done.
 */
 router.put('/:boat_id/loads/:load_id', async function (req, res){

    // console.log(`slip id is: ${req.params.load_id}`);
    // console.log(`boat id is: ${req.params.boat_id}`);

    const [is_valid, ownerId] = await loadsController.is_valid_request(req, res);

    // Invalid requests are terminated.
    if(!is_valid){
        return;
    }
    
    // Citation 1: Use of Promises -- See server.js file for full citation. 
    // Promise.all() allows async request to be sent together.
    Promise.all([
        loadsController.get_load(req.params.load_id),
        get_boat(req.params.boat_id)
    ])
    .then(resultsArr =>{

        const [load, boat] = resultsArr

        // console.log(load);
        // console.log(boat);

        if(load?.[0] === undefined || load?.[0] === null || boat?.[0] === undefined || boat?.[0] === null){
            // The 0th element is undefined. This means there is no load/boat with this id
            res.status(404).json({ 'Error': 'The specified boat and/or load does not exist' });
        }
        else if(load[0]?.owner_id !== ownerId || boat[0]?.owner_id !== ownerId){
            res.status(403).json({ 'Error': 'Forbidden Access!' });
        }
        else if(load[0]?.carrier !== null){
            // If load property carrier is NOT undefined, then the load is already assigned.
            res.status(403).json({ 'Error': 'The load is already assigned' });
        }
        else{
            
            load[0].carrier = {"id": req.params.boat_id, "name": boat[0].name};
            boat[0].loads.push( {"id": load[0].id, "item": load[0].item} );

            Promise.all([
                loadsController.put_load(load[0].volume, load[0].item, load[0].creation_date, load[0].carrier, load[0].owner_id, req.params.load_id),
                put_boat(boat[0].name, boat[0].type, boat[0].length, boat[0].loads, boat[0].owner_id, req.params.boat_id)
            ])
            // res.status(204).send(), if send() is not used, a connection error occurs.
            .then(res.status(204).send());
        }
    })   
});

/**
 * Unassign a Load.
 */
router.delete('/:boat_id/loads/:load_id', async function(req, res){ 

    const [is_valid, ownerId] = await loadsController.is_valid_request(req, res);

    // Invalid requests are terminated.
    if(!is_valid){
        return;
    }
    
    // Get boat and load based on their respective ids. 
    const [boat, load] = await Promise.all([
        get_boat(req.params.boat_id),
        loadsController.get_load(req.params.load_id)
    ])

    // Checks for boat & load Existence 
    if(boat[0]?.id === undefined || boat[0]?.id === null || load[0]?.id === undefined || load[0]?.id === null){
        res.status(404).json({"Error": "No boat with this boat_id is loaded with the load with this load_id"});
        return;
    }
    // Checks for the load being on the boat, if not, return error.
    if(load[0].carrier?.id === undefined || load[0].carrier?.id !== boat[0].id){
        res.status(404).json({"Error": "No boat with this boat_id is loaded with the load with this load_id"});
        return;
    }
    // Prevents One user from accessing another user's boat or load. -- Implement in Postman
    if(load[0]?.owner_id !== ownerId || boat[0]?.owner_id !== ownerId){
        return res.status(403).json({ 'Error': 'Forbidden Access!' });
    }

    // Remove load from boat, and carrier from load. 
    await Promise.all([remove_load(boat[0], load[0]), loadsController.remove_carrier(load[0])])
    .then(
        res.status(204).send()
    )
});

/**
 * Delete a Boat.
 */
 router.delete('/:boat_id', async function(req, res){ 

    const [is_valid, ownerId] = await loadsController.is_valid_request(req, res);

    // Invalid requests are terminated.
    if(!is_valid){
        return;
    }
    
    // Get boat and load based on their respective ids. 
    const boat = await get_boat(req.params.boat_id);
    
    // Checks for boat Existence 
    if(boat[0]?.id === undefined || boat[0]?.id === null){
        res.status(404).json({"Error": "No boat with this boat_id exists"});
        return;
    }

    // Prevents One user from accessing another user's boat. -- Implement in Postman
    if(boat[0]?.owner_id !== ownerId){
        return res.status(403).json({ 'Error': 'Forbidden Access!' });
    }
    
    // All promises to be resolved.
    const promiseArr = [];
    
    // Remove carrier from every load that the boat holds. 
    for(const aLoad of boat[0].loads){
        promiseArr.push(loadsController.remove_carrier(aLoad));
    }
    
    // Delete Boat from Datastore.
    promiseArr.push(delete_boat(boat[0].id));

    await Promise.all(promiseArr)
    .then(
        res.status(204).send()
    )
});

/* ------------- End Controller Functions ------------- */

module.exports = router;

/* ------------- Exported Functions ------------- */
exports.remove_load = remove_load;
exports.get_boat = get_boat;
