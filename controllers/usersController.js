const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();

// Controllers
const authController = require('./authController');

router.get("/", async function(req, res){
    
    // Checks to see if client can accept JSON as a response.
    const accepts = req.accepts('application/json');
    if(!accepts){
        return res.status(406).json({"Error": "Not Acceptable"});
    }

    const allUsers = await authController.get_all_users();
    res.status(200).json(allUsers);
})


module.exports = router;
