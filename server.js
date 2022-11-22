const express = require('express');
const app = express();

app.enable('trust proxy');
app.use('/', require('./index'));

// Set the Static Paths for Public Folder
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

// Cors Setup
const cors = require("cors");
app.use(cors());

// ******************** Render Engine ********************
const handlebars = require('express-handlebars');
app.set('view engine', 'handlebars');
app.engine('handlebars', handlebars.engine({
  defaultLayout: false
}));
app.set('views', path.join(__dirname, '/public'))

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`);
});

// ******************** Citations ********************

// Citation 1: 
// Title: How to use promises
// Author: MDN Contributors
// Date: 09/27/2022
// Date accessed: 10/13/2022
// URL: https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Promises
// Notes: For use of Promise.all() and .then() methods. 

// Citation 2: 
// Title: Exploration - Google App Engine and Node.js
// Author: Oregon State University
// Date: N/A
// Date accessed: 10/12/2022
// URL: Canvas
// Notes: Boilerplate code was modified/adapted or used wholly in my program. 

// Citation 3: 
// Title: Understanding data and file storage
// Author: Google
// Date: 10/12/2022
// Date accessed: 10/12/2022
// URL: https://cloud.google.com/appengine/docs/standard/storage-options
// Notes: Setup for Google Cloud Datastore. 

// Citation 4: 
// Title: User Management System
// Author: RaddyTheBrand
// Date: 11/08/2021
// Date accessed: 10/12/2022
// Medium: Video
// URL: https://www.youtube.com/watch?v=1aXZQcG2Y6I&list=PLYqkl7FT2ig8QES9nkovc04GrnRJAUhEb&index=1&t=2836s&ab_channel=RaddyTheBrand
// Notes: Refresher for setting up routerFile and Controllers.