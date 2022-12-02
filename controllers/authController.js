const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();

const path = require('path');

// Datastore Consts
const ds = require('../datastore');
const datastore = ds.datastore;
const KIND = "User";

// Google oauth2 Const
const {google} = require('googleapis');
const url = require('url');

// For Credential Reading
const fs = require("fs");

// For Client Credentials
const CREDENTIAL_LOCATION = "./client_credentials_hw9.json";
const GOOGLE_PROFILE_URL = "https://hw9-garzacao.uc.r.appspot.com/profile";
const LOCALHOST_PROFILE_URL = "http://localhost:8080/profile";
const SCOPE_API_URL = 'https://www.googleapis.com/auth/userinfo.profile';

// ******************** SELECT WHETHER TESTING OR NOT ********************
const IS_TEST = false;

// Get client credentials form client_credentials.json
const credentials = JSON.parse(fs.readFileSync(CREDENTIAL_LOCATION, "utf8"));
console.log(credentials);
const clientID = credentials.web.client_id;
const clientSecret = credentials.web.client_secret;
const redirectUrl = IS_TEST ? LOCALHOST_PROFILE_URL : GOOGLE_PROFILE_URL;
console.log(`The redirect url picked: ${redirectUrl}`);

// Access Scopes for Profile
const scopes = [SCOPE_API_URL];
// Citation #1 - Google OAuth2.0
const oauth2Client = new google.auth.OAuth2(
  clientID,
  clientSecret,
  redirectUrl
);

// Citation #1 - Authenticate with a backend server
// OAuth - Verify ID Token 
console.log(`this id is: ${clientID}`);
const {OAuth2Client} = require('google-auth-library');
const client = new OAuth2Client(clientID)

// **************************************** Datastore User Functions ****************************************

/**
 * Creates a entity of type KIND which stores the user_id.*/
 function post_user(firstName, lastName, ownerId) {
  var key = datastore.key(KIND);
  const data = { "first_name": firstName, "last_name": lastName, "owner_id": ownerId };
  return datastore.save({ "key": key, "data": data }).then(() => { return key });
}

/**
* Returns all states stored on Datastore as an array.*/
function get_all_users() {
  const q = datastore.createQuery(KIND);
  return datastore.runQuery(q).then((entities) => {
      // Use Array.map to call the function fromDatastore. This function
      // adds id attribute to every element in the array at element 0 of
      // the variable entities
      return entities[0].map(ds.fromDatastore);
  });
}

/**
* Deletes the state with the given datastore id.*/
function delete_state(id) {
const key = datastore.key([KIND, parseInt(id, 10)]);
return datastore.delete(key);
}

async function get_user(google_id){

}

// ******************** Verify ID Token Functions ********************
/**
 * 
 * @param {string} tokenID : represents the JWT provided to the user.
 * @returns An array with the values isValid tokenID, userID, errorMessage 
 * represented as typeof [bool, string/null, string/null]. 
 */
async function verify(tokenID){
    // Citation #1 - Authenticate with a backend server
    const issuer = ['accounts.google.com', 'https://accounts.google.com'];

    // Attempt to verify with google.
    const ticket = await client.verifyIdToken({
        idToken: tokenID,
        audience: clientID
    })
    .catch((error)=>{
        console.log(error);
        return [false, null, "Google could not verify the token_id!"];
    })
    
    // Checks for error.
    if (ticket[0] === false){
        return ticket;
    }

    // Get returned verified data.
    const payload = ticket.getPayload();
    console.log(`payload is: ${JSON.stringify(payload)}`);
    const userid = payload['sub'];

    // Match issuer. 
    if(!issuer.includes(payload.iss)){
        return [false, null, "the issuer did not match!"]
    }
    // Match Client id.
    else if(payload?.aud !== clientID){
        console.log(clientID);
        console.log(payload.aud);
        return [false, null, "client ID, did not match!"]
    }

    return [true, userid, null]
}

// **************************************** Routes ****************************************

// ******************** Welcome Page ********************
router.get('/welcome', async (req, res) => {
    res.sendFile(path.join(__dirname, '../public/welcome.html'));
})

// ******************** Redirect to Google Auth Page ********************
router.get('/redirect', async (req, res) => {

    console.log('********** redirect entered **********\n')
  
    /*
    Title: Using OAuth 2.0 for Web Server Applications
    Author: Google
    Date: 09/13/2022
    Date accessed: 11/02/2022
    URL: https://developers.google.com/identity/protocols/oauth2/web-server#redirecting
    Notes: Redirection to Google's Auth2.0
    */
    // Generates a 10 digit interger as a string to represent the state.
    // const stateString = (get_rand_int(1_000_000_000, 9_999_999_999)).toString()
  
    // State stored in Datastore.
    // await post_state(stateString);
    
    // Generate a url that asks permissions for the Profile Scope.
    const authorizationUrl = oauth2Client.generateAuthUrl( {
      //Offline (gets refresh token) -- the same as when done manually. 
      access_type: 'offline',
      // Pass in the scopes array above, or if only one is needed pass it as a string.
      scope: scopes,
      // Enable incremental authorization. Recommended as a best practice.
      include_granted_scopes: true
      // // Always prompt for consent
      // prompt: 'consent',
      //Enter the State
    //   state: stateString
      // // Redirect
      // redirect_uri: redirectUrl
    });
  
    console.log(authorizationUrl);
    console.log('entering the write');
  
    res.writeHead(307, { "Location": authorizationUrl });
  
    console.log('after res.writeHead');
    res.end();
})

// ******************** Profile Page ********************
router.get('/profile', async (req, res) => {
  console.log('********** entered profile **********');
  
  console.log(req.query);
  console.log(req.url);

  // Receive the callback from Google's OAuth 2.0 Server
  // Citation #2 - Using Google Oauth2.0
  let jwtValue = null;

  //Hande the OAuth 2.0 Server Response after redirection:
  let q = url.parse(req.url, true).query;
  console.log(`the parsed q is: \n${JSON.stringify(q)}`);

  // Log an Error if it happends:
  if(q.error){
    console.log('Error: ' + q.error);
  }
  else{
    // Get access and refresh tokens (if access_type is offline):
    let { tokens } = await oauth2Client.getToken(q.code);
    oauth2Client.setCredentials(tokens);
    // Get the JWT value from tokens which is id_token
    jwtValue = tokens.id_token;
    console.log(`The token is: ${JSON.stringify(tokens)}`);
  }
  
  // Citation #2 - Using Google Oauth2.0
  // Using Google People to get Profile info
  const profile = google.people('v1');
  const response = await profile.people.get({
    // Provide Authorization to access the People API Resource.
    auth: oauth2Client,
    // Required. A field mask to restrict which fields on the person are returned. Multiple fields can be specified by separating them with commas. Valid values are: * addresses * ageRanges * biographies * birthdays * calendarUrls * clientData * coverPhotos * emailAddresses * events * externalIds * genders * imClients * interests * locales * locations * memberships * metadata * miscKeywords * names * nicknames * occupations * organizations * phoneNumbers * photos * relations * sipAddresses * skills * urls * userDefined
    personFields: 'names',
    // NOT RECOMMENDED -- Required -- Depreciated. Comma-separated list of person fields to be included in the response. Each path should start with `person.`: for example, `person.names` or `person.photos`.
    // 'requestMask.includeField': 'placeholder-value',
    // Required. The resource name of the person to provide information about. - To get information about the authenticated user, specify `people/me`. - To get information about a google account, specify `people/{account_id\}`. - To get information about a contact, specify the resource name that identifies the contact as returned by `people.connections.list`.
    resourceName: 'people/me'
  });

  console.log(`Person Profile: \n${JSON.stringify(response)}`);

  // Get token verification complete. 
  let [isValid, userId, errorMessage] = await verify(jwtValue);
  let userInDatastore = false;

  if(!isValid){
    console.log(errorMessage);
  }
  else{

    // Check for user in datastore to prevent duplicate entries. 
    const allUsers = await get_all_users()

    for(const user of allUsers){
      if(user.owner_id === userId){
        userInDatastore = true;
      }
    }
    // Store the userID in datastore entity 'User'
    if(userInDatastore === false){
      await post_user(response?.data.names[0]?.givenName, response?.data.names[0]?.familyName, userId);
    }
  }

  // Display User info.
  res.render('profile', 
    {
      "first_name": response?.data.names[0]?.givenName,
      "family_name": response?.data.names[0]?.familyName,
      "unique_id": userId,
      "jwt_value": jwtValue
    }
  )
})

// ******************** CATCH-ALL Route ******************** 

// /**
//  * Catch all for GET route.*/
//  router.get("*", (req, res) => {
//   // handle 404 - Basically Unallowed Methods. 
//   return res.status(404).json({"Error": "Could not find that resource"});
// });

// /**
//  * Catch all unsupported routes*/
//  router.all("*", (req, res) => {
//   // handle 405 - Unallowed Methods. 
//   res.setHeader('Access-Control-Allow-Methods', 'GET');
//   return res.status(405).json({"Error": "This Method is not allowed"});
// });

module.exports = router;

module.exports.get_all_users = get_all_users;
module.exports.verify = verify;
