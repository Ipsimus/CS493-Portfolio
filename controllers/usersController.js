const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();

// Controllers
const authController = require('./authController');

// ******************** GET All Users ******************** 
router.get("/", async function(req, res){
    
    // Checks to see if client can accept JSON as a response.
    const accepts = req.accepts('application/json');
    if(!accepts){
        return res.status(406).json({"Error": "Not Acceptable"});
    }

    const allUsers = await authController.get_all_users();
    res.status(200).json(allUsers);
})

// ******************** CATCH-ALL Route ******************** 

/**
 * Catch all for get route.
 */
 router.get("*", (req, res) => {
    // handle 404 - Basically Unallowed Methods. 
    return res.status(404).json({"Error": "Could not find that resource"});
});

/**
 * Catch all route
 */
 router.all("*", (req, res) => {
    // handle 405 - Unallowed Methods. 
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    return res.status(405).json({"Error": "This Method is not allowed"});
});

module.exports = router;
