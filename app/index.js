var express = require("express");
var logfmt = require("logfmt");
var app = express();
var http = require("http");
var jws = require('jws');
var nodemailer = require("nodemailer");
var bodyParser = require('body-parser');
var crypto = require("crypto");
var qs = require("qs");
var promise = require("promise");

app.use(logfmt.requestLogger());
app.use(bodyParser.json());
//app.use(bodyParser.urlencoded());
app.use( bodyParser.urlencoded({ extended: true }) );

var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
    console.log("Listening on " + port);
});

//HOME PAGE
app.get('/', function(req, res) {

var claimData = {
    header: {typ: 'JWT', alg: 'HS256'},
    payload: {
        key: 'master',
        exp: Date.now() + (1000 * 60),
        method: 'GET',
        path: '/systems/badgekit/badges?published=true'
    },
    secret: process.env.MASTER_SECRET
}

var requestOptions = {
    hostname : process.env.API_URL,
    port : process.env.API_PORT,
    path : '/systems/badgekit/badges?published=true',
    method : 'GET',
    headers: { 'Authorization': 'JWT token="' + jws.sign(claimData) + '"' }
}


//query for badges using API endpoint

//show the list of badges in HTML
var apiRequest = http.request(requestOptions, function(apiResult) {

    var response = [];
    apiResult.setEncoding('utf8');
    apiResult.on('data', function(badgeData) {
        response.push(badgeData);
    });
    apiResult.on('end', function(){
        //write the data out
        //prepare the page outline - add some CSS!
	var outputHTML="<html>"+
	    "<head>"+
	    "<title>BADGES</title>"+
	    "<style type='text/css'>"+
	    "//put some css here"+
	    "</style>"+
	    "</head>"+
	    "<body>"+
	    "<h1>Current Active Badges</h1>"+
	    "<div class='badges'>";
	
	//parse the returned badge data, badges are in a "badges" array
	var badges=JSON.parse(response.join('')).badges; 
	var b;
	//loop through the array
	for(b=0; b<badges.length; b++){
	    //badge name in heading
	    outputHTML+="<h2>"+badges[b].name+"</h2>";
	    //badge image plus name in alt attribute
	    outputHTML+="<img alt='"+badges[b].name+"' src='"+badges[b].imageUrl+"'/>";
	    //strapline in paragraph
	    outputHTML+="<p>"+badges[b].strapline+"</p>";
	    //link to badge page including slug parameter
	    outputHTML+="<a href='badge?slug="+badges[b].slug+"'>More</a>";
	}
	//finish page
	outputHTML+="</div></body></html>";
	//write HTML out
	res.send(outputHTML);
    });

});

apiRequest.on('error', function(e) {
    console.error(e);
});
apiRequest.end();

});

//BADGE PAGE
app.get('/badge', function(req, res) {
//show the details for this badge
var slug=req.query.slug;
var badgePath="/systems/badgekit/badges/"+slug;

var claimData = {
    header: {typ: 'JWT', alg: 'HS256'},
    payload: {
        key: 'master',
        exp: Date.now() + (1000 * 60),
        method: 'GET',
        path: badgePath
    },
    secret: process.env.MASTER_SECRET
}

var requestOptions = {
    hostname : process.env.API_URL,
    port : process.env.API_PORT,
    path : badgePath,
    method : 'GET', 
    headers: { 'Authorization': 'JWT token="' + jws.sign(claimData) + '"' }
};


var apiRequest = http.request(requestOptions, function(apiResult) {
    var response = [];
    apiResult.setEncoding('utf8');
    apiResult.on('data', function(badgeData) {
        response.push(badgeData);
    });
    apiResult.on('end', function(){
        //process the data
	var outputHTML="<html>"+
    	"<head>"+
    	"<title>BADGE</title>"+
    	"<style type='text/css'>"+
    	"//add some CSS"+
    	"</style>"+
    	"</head>"+
    	"<body>";
    	//the badge data is in "badge"
    	var badgeData = JSON.parse(response.join('')).badge;
    	//badge name in heading
    	outputHTML+="<h1>"+badgeData.name+"</h1>";
    	outputHTML+="<div class='badge'>";
    	outputHTML+="<img alt='"+badgeData.name+"' src='"+badgeData.imageUrl+"'/>";
    	outputHTML+="<p>"+badgeData.strapline+"</p>";
    	outputHTML+="<p class='desc'>"+badgeData.earnerDescription+"</p>";

   	//loop through criteria - write to list
    	var c;
    	var criteria=badgeData.criteria;
    	if(criteria.length>0) outputHTML+="<h2>Criteria:</h2><ul>";
    	for(c=0; c<criteria.length; c++){
        	outputHTML+="<li>"+criteria[c].description+"</li>";
    	}
    	if(criteria.length>0) outputHTML+="</ul>";

    	//link to badge application page
    	outputHTML+="<a href='apply?slug="+badgeData.slug+"&name="+badgeData.name+"'>Apply</a>";
    	outputHTML+="</div></body></html>";
    	res.send(outputHTML);
    });
});

apiRequest.on('error', function(e) {
    console.error(e);
});
apiRequest.end();

});


//VIEWBADGE ASSERTION PAGE
app.get('/viewBadge', function(req, res) {
	//show the details for this badge

	var assertionURL = req.query.assertion;

	//implementing promisses here because of async nature of gatAPIObjectAtURL
	var assertion;
	var outputHTML="";
	
	getAPIObjectAtURL(assertionURL, 'assertion')
	.then(assertion => {
		var utcSeconds = assertion.issuedOn;
		var issueDate = new Date(0); // The 0 there is the key, which sets the date to the epoch
		issueDate.setUTCSeconds(utcSeconds);

		var badgeName = assertion.badge.split("/").pop();
		
		outputHTML="<html>"+
		"<head>"+
		"<title>BADGE</title>"+			
		"<style type='text/css'>"+
		"//add some CSS"+
		"</style>"+
		"</head>"+
		"<body>";		
		outputHTML+="<div class='assertion'>";
		outputHTML+="<h1>"+badgeName+" Assertion</h1>";
		outputHTML+="This Assertion belongs to the following badge url ";
		outputHTML+="<a href='"+assertionURL+"'>"+assertionURL+"</a><br/>";
		outputHTML+="it was issued on: "+issueDate.toString();
		outputHTML+="</div>";
		return getAPIObjectAtURL(assertion.badge, 'badge');})
	// wait for badgeInfo to be loaded
	.then(badgeData => {


		//badge name in heading
		var badgeInfo = badgeData.badge;
		outputHTML+="<h1>"+badgeInfo.name+"</h1>";
		outputHTML+="<div class='badge'>";
		outputHTML+="<img alt='"+badgeInfo.name+"' src='"+badgeInfo.imageUrl+"'/>";
		outputHTML+="<p>"+badgeInfo.strapline+"</p>";
		outputHTML+="<p class='desc'>"+badgeInfo.earnerDescription+"</p>";

		//loop through criteria - write to list
		var c;
		var criteria=badgeInfo.criteria;
		if(criteria.length>0) outputHTML+="<h2>Criteria:</h2><ul>";
		for(c=0; c<criteria.length; c++){
			outputHTML+="<li>"+criteria[c].description+"</li>";
		}
		if(criteria.length>0) outputHTML+="</ul>";

		outputHTML+="</div></body></html>";
		res.send(outputHTML);			
	})
	.catch (error => {console.log(error)});
	


});




//APPLY PAGEa
app.get('/apply', function(req, res) {

	//application form
	var slug=req.query.slug;
	var badgeName=req.query.name;

	res.send("<html>"+
		"<head>"+
		"<title>Apply for "+badgeName+"</title>"+
		"<style type='text/css'>"+
		"//add some css"+
		"</style>"+
		"</head>"+
		"<body>"+
		"<h1>Apply for "+badgeName+"</h1>"+
		"<p>Include evidence for your application and your email address below:</p>"+
		"<form action='/sendApp' method='post'>"+
		"<input type='hidden' name='slug' value='"+slug+"'/>"+
		"Evidence:<br/><textarea rows='5' cols='50' name='evidence' required></textarea><br/>"+
		"Email:<br/><input type='email' name='email' required/><br/>"+
		"<input type='submit' value='Apply'/>"+
		"</form>"+
		"</body>"+
		"</html>"
		);

});

//submit application
app.post('/sendApp', function(req, res) {
	//submit form
	var applicationPath = "/systems/badgekit/badges/"+req.body.slug+"/applications";
	
	var appData = qs.stringify({
	    learner: req.body.email, 
	    evidence: [{ reflection: req.body.evidence }]
	});

	var claimData = {
	    header: {typ: 'JWT', alg: 'HS256'},
	    payload: {
	        key: 'master',
	        exp: Date.now() + (1000 * 60),
	        method: 'POST',
	        path: applicationPath,
	        body: {
	              alg: "sha256",
	              hash: crypto.createHash('sha256').update(appData).digest('hex')
	            }
	        },
	    secret: process.env.MASTER_SECRET
	};
	
	var requestOptions = {
	    hostname : process.env.API_URL,
	    port : process.env.API_PORT, 
	    path : applicationPath, 
	    method : 'POST', 
	    headers: { 'Authorization': 'JWT token="' + jws.sign(claimData) + '"',
	        'Content-Type': 'application/x-www-form-urlencoded',
	        'Content-Length': Buffer.byteLength(appData)
		}
	};
	console.log(requestOptions);	
	var postRequest = http.request(requestOptions, function(appResponse) { 
		//respond
		var response = [];
		appResponse.setEncoding('utf8');
		appResponse.on('data', function(responseData) {                    
			console.log('Response: ' + responseData);
			response.push(responseData);
		});
		console.log('1');
		appResponse.on('end', function(){
			//data end
			var appStatus=JSON.parse(response.join('')).status; 
			if(appStatus==="created"){
				res.send("<html>"+
					"<head>"+
					"<title>Application Successful</title>"+
					"<style type='text/css'>"+
					"//add some css"+
					"</style>"+
					"</head>"+
					"<body>"+
					"<h1>Application Successful</h1>"+
					"<p>Thanks for your application! We'll be in touch when it's processed.</p>"+
					"</body>"+
					"</html>"
				);
			}
			else {
				res.send("Whoops! Something went wrong with your application.");
			}
		});
	
	});
	postRequest.on('error', function(e) {
	    console.error(e);
		console.log('1');
	});

	//write the application data
	postRequest.write(appData);
	postRequest.end();

	console.log('1');
});

//HOOK
app.post('/hook', function(req, res) {
//process notifications

	const token = getAuthToken(req)
    		if (!token)
      			return next(new http403('Missing valid Authorization header'))
    	const parts = jws.decode(token)
    	const auth = parts.payload

	if (!jws.verify(token, process.env.ALGO_MASTER_SECRET, process.env.HOOK_SECRET)) { //use your secret
		console.log("verification failed");
	}
	else{
	    //process the data
		var decodedToken;
		try {
		    decodedToken = jws.decode(token); 
		    if (decodedToken.payload.body.hash !== crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex')) {
		        console.log("body hash does not match token hash");
		    }
		    else {
		        //process review data
			var action = req.body.action;
			var info="";
			var emailTo="";
			var host='';			
			if(process.env.PORT === "") {
				host=process.env.HOST;
			}
			else {
				host = process.env.HOST +":"+ process.env.PORT;
			} 
			switch(action) {
			    //review event
			    case 'review':
			        //earner email
			        emailTo=req.body.application.learner;
			        //build badge name into email
			        info+="<p>Your application for the following badge was reviewed:"+ 
				            "<strong>"+req.body.application.badge.name+"</strong></p>";
		
			        //respond differently if approved or not
			        if(req.body.approved){ 
			            info+="<p>Great news - your application was approved!</p>";
			            //include link to accept the badge
			            // - alter for your url
			            info+="<p><a href="+
			                "'http://"+host+"/accept?badge="+
			                req.body.application.badge.slug+
			                "&earner="+req.body.application.learner+
			                "&application="+req.body.application.slug+
			                "'>Accept your badge</a></p>";
			        }
			        else{
			            info+="<p>Unfortunately your application was unsuccessful this time. "+
			                "You can re-apply for the badge any time though!</p>";
			        }
			        //review includes multiple feedback and comment items
			        info+="<p>The reviewer included feedback for you:</p>";
			        info+="<ul>";
			        //comment field includes everything in the Finish page in BadgeKit Web app
			        info+="<li><em>"+req.body.review.comment+"</em></li>";
			        //review items array, one per criteria - build into list
			        var reviewItems = req.body.review.reviewItems;
			        var r;
			        for(r=0; r<reviewItems.length; r++){
			            info+="<li><em>"+reviewItems[r].comment+"</em></li>";
			            //can also include whether each criteria item was satisfied
			        }
			        info+="</ul>";
			        info+="<p><strong><em>Thanks for applying!</em></strong></p>";
			break;
			case 'award':
			//process award hook        
				emailTo=req.body.email;
				info+="<p>You've been awarded this badge:</p>";
				info+="<img src='"+req.body.badge.imageUrl+"' alt='badge'/>";
				info+="<p><a href='http://"+host+"/viewBadge?assertion="+req.body.assertionUrl+"'>View Badge</a></p>";
				//can offer to push to backpack etc	
			break;
			}
			// create reusable transporter object using the default SMTP transport
			var transporter = nodemailer.createTransport(process.env.SMTP_STRING); 
			var mailData = {
			    from: "Badge Issuer <"+process.env.EMAIL+">", //your email
			    to: emailTo,
			    subject: "Badge", //your subject
			    generateTextFromHTML: true,
			    html: info
			};
			// send mail with defined transport object
			transporter.sendMail(mailData, function(error, info){
			    if(error){
			        return console.log(error);
			    }
			    console.log('Message sent: ' + info.response);
			});
		    }
		} catch(err) {
		    console.log("error decoding the data");
		}
	}
	
});


function getAuthToken(req) {
  const authHeader = req.headers.authorization
  if (!authHeader) return

  const match = authHeader.match(/^JWT token="(.+?)"$/)
  if (!match) return

  return match[1]
}

function getAPIObjectAtURL(url, type){

    return new Promise(
        function (resolve, reject) {

			var objectPath=urlToPath(url);
			if (type == 'badge')
			{ objectPath=objectPath.replace('/public',''); }

			var claimData = {
				header: {typ: 'JWT', alg: 'HS256'},
				payload: {
					key: 'master',
					exp: Date.now() + (1000 * 60),
					method: 'GET',
					path: objectPath
				},
				secret: process.env.MASTER_SECRET
			};

			var requestOptionsBadge = {
				hostname : process.env.API_URL,
				port : process.env.API_PORT,
				path : objectPath,
				method : 'GET', 
				headers: { 'Authorization': 'JWT token="' + jws.sign(claimData) + '"' }
			};

			var apiFunctionRequest = http.request(requestOptionsBadge, function(apiFunctionResult) {
				var responseBadge = [];
				apiFunctionResult.setEncoding('utf8');
				apiFunctionResult.on('data', function(object) {
					responseBadge.push(object);
				});
				apiFunctionResult.on('end', function(){
					//process the data
				var object = JSON.parse(responseBadge.join(''));
				
				resolve(object);
				});
			});

			apiFunctionRequest.on('error', function(e) {
				console.error(e);
				reject(e);
			});
			apiFunctionRequest.end();
		});
		
}

function urlToPath(url){
	if (process.env.API_URL != ''){
		url=url.replace('http://'+process.env.API_URL,'');
	}
	if (process.env.API_PORT != ''){
		url=url.replace(':'+process.env.API_PORT,'');
	}
	return url;
}
