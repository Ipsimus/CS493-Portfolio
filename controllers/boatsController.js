const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const ds = require('../datastore');
const loadsController = require('./loadsController');

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
function put_boat(name, type, length, loads=[], owner, id=null){
    
    let key;

    if(id === null){
        key = datastore.key(BOAT);
    }
    else{
        key = datastore.key([BOAT, parseInt(id, 10)]);
    }
    
	const new_boat = {"name": name, "type": type, "length": length, "loads": loads, "owner": owner};
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

    return await put_boat(boat.name, boat.type, boat.length, new_loads, boat.owner, boat.id);
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
 router.get('/', function(req, res){
    loadsController.get_entity(req, BOAT)
	.then( (allBoats) => {
        
        // console.log(allLoads);

        allBoats.items.forEach(boat => {
            
            // Also creates self link when responding to client. 
            boat.self = req.protocol + "://" + req.get('host') + req.baseUrl + "/" + boat.id
            
            // Creates self reference for loads. 
            for(let load of boat.loads){
                load.self = req.protocol + "://" + req.get('host') + "/loads" + "/" + load.id;
            }
        });

        const returnObj = {}

        Object.keys(allBoats).forEach(key => {
            if (key === 'items'){
                returnObj.boats = allBoats[key];
            }
            else{
                returnObj[key] = allBoats[key];
            }
        })

        res.status(200).json( returnObj );
    });
});

/**
 * Gets a Boat with given ID. */
 router.get('/:boat_id', function (req, res){
    console.log("Entered the route.");
    get_boat(req.params.boat_id)
    .then(boat => {
        if (boat[0] === undefined || boat[0] === null) {
            // The 0th element is undefined. This means there is no boat with this id
            res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
        } else {
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
 * Add a Boat */ 
router.post('/', function(req, res){

    let loadsArr = [];

    if(req.body?.name === undefined || req.body?.type === undefined || req.body?.length === undefined){
        return res.status(400).json( {"Error": "The request object is missing at least one of the required attributes"});
    }

    if(req.body?.loads === undefined || req.body?.loads.length <= 0){
        loadsArr = [];
    }
    else{
        loadsArr = req.body.loads;
    }

    put_boat(req.body.name, req.body.type, req.body.length, loadsArr)
    .then( key => {res.status(201)
        .send({
            "id": key.id,
            "type": req.body.type,
            "name": req.body.name,
            "length": req.body.length,
            "loads": loadsArr,
            "owner": req.body.owner,
            "self": req.protocol + "://" + req.get('host') + req.baseUrl + "/" + key.id
        })
    });
});

/**
 * Load is Assigned to a Boat.
 */
 router.put('/:boat_id/loads/:load_id', async function (req, res){

    // console.log(`slip id is: ${req.params.load_id}`);
    // console.log(`boat id is: ${req.params.boat_id}`);
    
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
        else if(load[0]?.carrier !== null){
            // If load property carrier is NOT undefined, then the load is already assigned.
            res.status(403).json({ 'Error': 'The load is already loaded on another boat' });
        }
        else{
            
            load[0].carrier = {"id": req.params.boat_id, "name": boat[0].name};
            boat[0].loads.push( {"id": load[0].id} );

            Promise.all([
                loadsController.put_load(load[0].volume, load[0].item, load[0].creation_date, load[0].carrier, req.params.load_id),
                put_boat(boat[0].name, boat[0].type, boat[0].length, boat[0].loads, boat[0].owner, req.params.boat_id)
            ])
            // res.status(204).send(), if send() is not used, a connection error occurs.
            .then(res.status(204).send());
        }
    })   
});

/**
 * Remove a Load.
 */
router.delete('/:boat_id/loads/:load_id', async function(req, res){ 
    
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

    // Remove load from boat, and carrier from load. 
    
    await remove_load(boat[0], load[0]),
    await loadsController.remove_carrier(load[0])
    
    
    res.status(204).send()
    
});

/**
 * Delete a Boat.
 */
 router.delete('/:boat_id', async function(req, res){ 
    
    // Get boat and load based on their respective ids. 
    const boat = await get_boat(req.params.boat_id);
    
    // Checks for boat Existence 
    if(boat[0]?.id === undefined || boat[0]?.id === null){
        res.status(404).json({"Error": "No boat with this boat_id exists"});
        return;
    }
    
    // Remove carrier from every load that the boat holds. 
    for(const aLoad of boat[0].loads){
        await loadsController.remove_carrier(aLoad);
    }

    // Delete Boat from Datastore.
    await delete_boat(boat[0].id);

    // Remove load from boat, and carrier from load. 
    res.status(204).send()

});

/* ------------- End Controller Functions ------------- */

module.exports = router;

/* ------------- Exported Functions ------------- */
exports.remove_load = remove_load;
exports.get_boat = get_boat;