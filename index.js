var currentYear = 2018;
var fs = require('fs');
var readline = require('readline');
var google = require('googleapis');
var googleAuth = require('google-auth-library');
var oauth2Client;
var requestUrl = 'https://flowxo.com/hooks/a/4wpvd8bb';

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/sheets.googleapis.com-nodejs-quickstart.json
var SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
  process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'sheets.googleapis.com-nodejs-quickstart.json';
var sheets = google.sheets('v4');

var constants = require("./constants.js");

var admin = require("firebase-admin");
const request = require('request');

var serviceAccount = require("./task-d7f04c329dd3.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://task-3d21a.firebaseio.com/"
});

// Get a database reference to our posts
var db = admin.database();
var refSheets = db.ref("sheets");
var refAccessCode = db.ref("access-code");
var refInputData = db.ref("inputdata");

refInputData.orderByChild("status").equalTo("new").on("child_added", function(snapshot, prevChildKey) {
  var post = snapshot.val();
  var mysql = require('mysql');
  var sqlQuery  = setSqlQuery(post);
  var sqlResult;
  console.log("vars completed");
  var mySQL = mysql.createConnection({
    host: constants.MYSQL_HOST,
    user: constants.MYSQL_USER,
    password: constants.MYSQL_PASSWORD,
    database: "mjdb_kloopasia"
  });
  console.log("mySQL completed");
  mySQL.connect(function(err) {
    if (err) throw console.log(err);
    console.log("Connected!");
    if(sqlQuery){
      mySQL.query(sqlQuery, function (err, result) {
        if (err) throw err;
        console.log(result);
        sqlResult = result;
        updateFirebaseData(snapshot, sqlResult);
        sendSqlResultToFlowXO(snapshot, sqlResult);
      });
    }
  });
  
});

function sendSqlResultToFlowXO(snapshot, sqlResult){
  var post = snapshot.val();
  var respPath = post.responsePath;
  request({
    method: 'post',
    url: requestUrl,
    form: {
      "message": sqlResult,
      "path": respPath,
    },
    json: true,
  }, (err, res, body) => {
    if (err) { return console.log(err); }
    console.log(body.url);
    console.log(body.explanation);
  });
  console.log("Message sended");
}

function updateFirebaseData(snapshot, sqlResult){
  var post = snapshot.val();
  refInputData.child(snapshot.key).update({
    "message": post.message,
    "number": post.number,
    "name": post.name,
    "responsePath": post.responsePath,
    "lastname": post.lastname,
    "patronymic": post.patronymic,
    "status": "sqlResult received",
    "result": sqlResult
  });
}

function setSqlQuery(post){
  var number = post.number;
  var name = post.name;
  var lastname = post.lastname;
  var patronymic = post.patronymic;
  var street = post.street;
  var building = post.building;
  var yearOfBirth = post.yearOfBirth;
  var age = post.age;
  var query;
  
  if (name != "" || lastname != "" || patronymic != ""){
    query = "(SELECT * FROM Links LEFT JOIN Pages ON Links.LinkID = Pages.Links_LinkID " + 
    "WHERE HeadName LIKE '%" + lastname + "%' AND HeadName LIKE '%" + name + "%' AND HeadName LIKE '%" + patronymic + "%')"+
    " UNION " +
    "(SELECT * FROM Links LEFT JOIN Pages ON Links.LinkID = Pages.Links_LinkID " + 
    "WHERE Founders LIKE '%" + lastname + "%' AND Founders LIKE '%" + name + "%' AND Founders LIKE '%" + patronymic + "%')";
  }else if (number != ""){
    query = "SELECT * FROM Links LEFT JOIN Pages ON Links.LinkID = Pages.Links_LinkID " + 
    "WHERE Phone LIKE '%" + number + "%'";
  }else if (street != ""){
    query = "SELECT * FROM Links LEFT JOIN Pages ON Links.LinkID = Pages.Links_LinkID " +
    "WHERE Street LIKE '%" + street + "%'";
  }else if (street != "" && building != ""){
    query = "SELECT * FROM Links LEFT JOIN Pages ON Links.LinkID = Pages.Links_LinkID " +
    "WHERE Street LIKE '%" + street + "%' AND Building LIKE '%" + building + "%'";
  // }else if (age != ""){
  //   query = "SELECT * FROM Links LEFT JOIN Pages ON Links.LinkID = Pages.Links_LinkID " +
  //   "WHERE Street LIKE '%" + street + "%' AND Building LIKE '%" + building + "%'";
  }
  else query = "SELECT * FROM `Links` WHERE Link = 0";
  
  console.log(query);
  return query;
}

// Get the data on a post that has changed
refSheets.orderByChild("status").equalTo("new").on("child_added", function(snapshot, prevChildKey) {
  var changedPost = snapshot.val();
  var token = null;
  //console.log("The updated post title is " + changedPost.responsePath);
  console.log(changedPost.sqlResult);
  var respPath = changedPost.responsePath;

  for (var i = 0; i < 27; i++) {
    respPath = respPath.substr(1);
  }

  refAccessCode.child(respPath).once("value", function(snapshot) {
    var post = snapshot.val();
    //token = post.token;
  });



  // if (token == null){
  // Load client secrets from a local file.
  fs.readFile('./client_secret.json', function processClientSecrets(err, content) {
    if (err) {
      console.log('Error loading client secret file: ' + err);
      return;
    }
    // Authorize a client with the loaded credentials, then call the
    // Google Sheets API.
    sendAuthLink(JSON.parse(content), respPath);
  });

  // }else createSpreadSheet(changedPost.sqlResult, changedPost.responsePath, token);

  //TODO: Check presence of auth tokens
  //TODO: If token present, create spreadsheet and send link,
  //if not generate link, send to user, generate tokens,
  // save tokens, create spreadsheet, send link

  //    request('https://flowxo.com/hooks/a/qweqx773?path=' + changedPost.responsePath + changedPost, { json: true }, (err, res, body) => {
  //      if (err) { return console.log(err); }
  //      console.log(body.url);
  //      console.log(body.explanation);
  //    });

});

function sendAuthLink(credentials, respPath) {
  var clientSecret = credentials.installed.client_secret;
  var clientId = credentials.installed.client_id;
  var redirectUrl = credentials.installed.redirect_uris[0];
  var auth = new googleAuth();
  oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

  generateAuthLink(redirectUrl, respPath);

  var authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state: respPath
  });

  console.log("sendAuthLink confirm");
  sendChatMessage(authUrl, respPath);

}

function generateAuthLink(authUrl, respPath) {
  console.log("generateAuthLink confirm");
  return authUrl + "&path=" + respPath + "&sourcetype=user";
}

function createSpreadSheet(sheetData, respPath, tokens) {
  const updateSpreadsheet = () => {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_ID,
      process.env.GOOGLE_SECRET
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });

    oauth2Client.refreshAccessToken((err, tokens) => {
      if (err) return console.error(err);

      oauth2Client.setCredentials({
        access_token: tokens.access_token
      });
      sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
        range: 'Sheet1',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: [
            [new Date().toISOString(), "Some value", "Another value"]
          ],
        },
        auth: oauth2Client
      }, (err, response) => {
        if (err) return console.error(err);
      });

    });
  };
  updateSpreadsheet();
  console.log("SpreadSeet updated");
}

refAccessCode.orderByChild("status").equalTo("new").on("child_added", function(snapshot, prevChildKey) {
  var changedPost = snapshot.val();
  var code = changedPost.accessCode;
  if (oauth2Client != null) {
    oauth2Client.getToken(code, (err, token) => {
      if (err) {
        console.log('Error while trying to retrieve access token', err);
      }
      else sendToken(changedPost, token);
    });
  }
});

function sendChatMessage(message, respPath) {
  var link = requestUrl + '?path=' + respPath + "&sourcetype=automessage";
  request({
    method: 'post',
    url: link,
    form: {
      "message": message,
      "path": respPath
    },
    json: true,
  }, (err, res, body) => {
    if (err) { return console.log(err); }
    console.log(body.url);
    console.log(body.explanation);
  });
  console.log("sendMessage confirm");
}



function sendToken(snapshot, token) {
  refAccessCode.child(snapshot.key).update({
    "accessCode": snapshot.accessCode,
    "token": token,
    "status": "token-received"
  });
}
