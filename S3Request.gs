

//constants
var SECONDS_PER_DAY = 86400;
var DEFAULT_REGION = "us-east-1";

/* constructs an S3Request to an S3 service
 *
 * @constructor
 * @param {S3} service S3 service to which this request will be sent
 */
function S3Request(service) {
  this.service = service;

  this.httpMethod = "GET";
  this.contentType = "";
  this.content = ""; //content of the HTTP request
  this.bucket = ""; //gets turned into host (bucketName.s3.amazonaws.com)
  this.objectName = "";
  this.headers = {};
  
  this.date = new Date();
}

/* sets contenetType of the request
 * @param {string} contentType mime-type, based on RFC, indicated how content is encoded
 * @throws {string} message if invalid input
 * @return {S3Request} this request, for chaining
 */
S3Request.prototype.setContentType = function (contentType) {
  if (typeof contentType != 'string') throw "contentType must be passed as a string";
  this.contentType = contentType;
  return this;
};

S3Request.prototype.getContentType = function () {
  if (this.contentType) {
    return this.contentType; 
  } else {
    //if no contentType has been explicitly set, default based on HTTP methods
    if (this.httpMethod == "PUT" || this.httpMethod == "POST") {
      //UrlFetchApp defaults to this for these HTTP methods
      return "application/x-www-form-urlencoded"; 
    }
  }
  return "";
}


/* sets content of request
 * @param {string} content request content encoded as a string
 * @throws {string} message if invalid input
 * @return {S3Request} this request, for chaining
 */ 
S3Request.prototype.setContent = function(content) {
  if (typeof content != 'string') throw "content must be passed as a string"
  this.content = content; 
  return this;
};

/* sets Http method for request
 * @param {string} method http method for request
 * @throws {string} message if invalid input
 * @return {S3Request} this request, for chaining
 */
S3Request.prototype.setHttpMethod = function(method) {
  if (typeof method != 'string') throw "http method must be string";
  this.httpMethod = method; 
  return this;
};

/* sets bucket name for the request
 * @param {string} bucket name of bucket on which request operates
 * @throws {string} message if invalid input
 * @return {S3Request} this request, for chaining
 */
S3Request.prototype.setBucket = function(bucket) {
  if (typeof bucket != 'string') throw "bucket name must be string";
  this.bucket = bucket;
  return this;
};
/* sets objectName (key) for request
 * @param {string} objectName name that uniquely identifies object within bucket
 * @throws {string} message if invalid input
 * @return {S3Request} this request, for chaining
 */
S3Request.prototype.setObjectName = function(objectName) {
  if (typeof objectName != 'string') throw "objectName must be string";
  this.objectName = objectName; 
  return this;
};


/* adds HTTP header to S3 request (see AWS S3 REST api documentation for possible values)
 * 
 * @param {string} name Header name
 * @param {string} value Header value
 * @throws {string} message if invalid input
 * @return {S3Request} this object, for chaining
 */
S3Request.prototype.addHeader = function(name, value) {
  if (typeof name != 'string') throw "header name must be string";
  if (typeof value != 'string') throw "header value must be string";
  this.headers[name] = value; 
  return this;
};

/* gets Url for S3 request 
 * @return {string} url to which request will be sent
 */
S3Request.prototype.getUrl = function() {
  return "http://" + this.bucket.toLowerCase() + ".s3.amazonaws.com/" + this.objectName;
};
/* executes the S3 request and returns HttpResponse
 *
 * Supported options:
 *   logRequests - log requests (and responses) will be logged to Apps Script's Logger. default false.
 *   echoRequestToUrl - also send the request to this URL (useful for debugging Apps Script weirdness)   
 *
 * @param {Object} options object with properties corresponding to option values; see documentation
 * @throws {Object} AwsError on failure
 * @returns {goog.UrlFetchApp.HttpResponse} 
 */
S3Request.prototype.execute = function(options) {
  options = options || {};
  
  this.headers.Authorization = this.getAuthHeader_();
  this.headers.Date = this.date.toUTCString();
  if (this.content.length > 0) {
    this.headers["Content-MD5"] = this.getContentMd5_();
  }
  
  var params = {
    method: this.httpMethod,
    payload: this.content,
    headers: this.headers,
    muteHttpExceptions: true //get error content in the response
  }

  //only add a ContentType header if non-empty (although should be OK either way)
  if (this.getContentType()) {
    params.contentType = this.getContentType();
  }
  
  var response = UrlFetchApp.fetch(this.getUrl(), params);


  
  //debugging stuff
  var request = UrlFetchApp.getRequest(this.getUrl(), params);  


  //Log request and response
  this.lastExchangeLog = this.service.logExchange_(request, response);
  if (options.logRequests) {
    Logger.log(this.service.getLastExchangeLog());
  }
  
  //used in case you want to peak at the actual raw HTTP request coming out of Google's UrlFetchApp infrastructure
  if (options.echoRequestToUrl) {
    UrlFetchApp.fetch(options.echoRequestToUrl, params); 
  }
  
  //check for error codes (AWS uses variants of 200s for flavors of success)
  if (response.getResponseCode() > 299) {
    //convert XML error response from AWS into JS object, and give it a name
    var error = {};
    error.name = "AwsError";
    try {
      var errorXmlElements = XmlService.parse(response.getContentText()).getRootElement().getChildren();
    
      for (i in errorXmlElements) {
        var name = errorXmlElements[i].getName(); 
        name = name.charAt(0).toLowerCase() + name.slice(1);
        error[name] = errorXmlElements[i].getText();
      }
      error.toString = function() { return "AWS Error - "+this.code+": "+this.message; }; 
     
      error.httpRequestLog = this.service.getLastExchangeLog();
    } catch (e) {
      //error parsing XML error response from AWS (will obscure actual error)
 
      error.message = "AWS returned HTTP code " + response.getResponseCode() + ", but error content could not be parsed."
      
      error.toString = function () { return this.message; };
      
      error.httpRequestLog = this.service.getLastExchangeLog();
    }
    
    throw error;
  }
  
  return response;
};


/* get a presigned URL for an object
 * @author David Su <david.d.su@gmail.com>
 * @param {Object} options options to be passed in ("expires", "testing")
 * @return {string} the URL
 */ 
S3Request.prototype.getSignedUrl = function(options) {
  var url = this.getUrl();
  var accessKeyId = this.service.accessKeyId;
  
  options["expires"] = options["expires"] || SECONDS_PER_DAY; // default to one day.
  if (options["expires"] < 1 || options["expires"] > 7*SECONDS_PER_DAY) {
    throw new "'expires' option must be within 1 and 604800 seconds (7 days), inclusive";
  }
  
  var url = this.authenticate(options, "url");

  return url;
};

/* authenticate a request using query parameters according to
 * AWS Signature Version 4
 * @author David Su <david.d.su@gmail.com>
 *
 * @param {Object} options options to be passed in ("expires", "testing")
 * @param {string} mode determine what to return: "signature" or "url"
 * @return {string} the final URL or signature
 */ 
S3Request.prototype.authenticate = function(options, mode) {
  options = options || {};

  // 1a. CanonicalRequest
  // https://s3.amazonaws.com/examplebucket/test.txt
  // ?X-Amz-Algorithm=AWS4-HMAC-SHA256
  // &X-Amz-Credential=<your-access-key-id>/20130721/us-east-1/s3/aws4_request
  // &X-Amz-Date=20130721T201207Z
  // &X-Amz-Expires=86400
  // &X-Amz-SignedHeaders=host
  // &X-Amz-Signature=<signature-value> 

  var canonicalRequest = "";

  //    i. HTTP verb
  canonicalRequest += this.httpMethod + "\n";

  //    ii. Canonical URI
  var canonicalizedResource = this.getUrl().replace("http://"+this.bucket.toLowerCase()+".s3.amazonaws.com","");
  canonicalizedResource = encodeURIComponent(canonicalizedResource).replace(/%2F/g, "/");
  canonicalRequest += canonicalizedResource + "\n";

  //    iii. Canonical Query String
  
  //          - algorithm
  var amzAlgorithm = "AWS4-HMAC-SHA256";
  
  var canonicalQueryString = "X-Amz-Algorithm=" + amzAlgorithm;

  //          - credentials
  var date = new Date();
  if ("signatureTesting" in options && options.signatureTesting == true) {
      date = new Date(Date.UTC("2013", "04", "24")); // testing with default
  }
  var dateStr = date.getUTCFullYear() + ("0" + (date.getUTCMonth()+1) ).slice(-2) + ("0" + date.getUTCDate()).slice(-2)
  
  var region = options.region || DEFAULT_REGION;
  
  var amzCredentialParts = [this.service.accessKeyId, dateStr, region, "s3", "aws4_request"];
  
  canonicalQueryString += "&X-Amz-Credential=" + amzCredentialParts.join("%2F");

  //          - date
  var timeStr = ("0" + date.getUTCHours()).slice(-2) + ("0" + date.getUTCMinutes()).slice(-2) + ("0" + date.getUTCSeconds()).slice(-2);
  var timestamp = dateStr + "T" + timeStr + "Z"; // utc
  canonicalQueryString += "&X-Amz-Date=" + timestamp;


  //          - expires
  var expires = 86400; // 24 hours
  if (options.hasOwnProperty("expires")) {
    expires = options.expires;
  }
  canonicalQueryString += "&X-Amz-Expires=" + expires;


  //          - signed headers
  var amzHeaders = ["host:" + this.bucket.toLowerCase()+".s3.amazonaws.com"]; //, "x-amz-date:" + timestamp];
  var signedHeaders = ["host"]; //, "x-amz-date"];

  for (var headerName in this.headers) {
    // only AMZ headers
    // convert to lower case (1)
    // multi-line headers to single line (4)
    // one space after : (5)
    if (headerName.match(/^x-amz/i)) {
      var header = headerName.toLowerCase() + ":" + this.headers[headerName].trim();
      amzHeaders.push(header);
      signedHeaders.push(headerName.toLowerCase());
    }
  }

  var canonicalHeaderStr = amzHeaders.sort().join("\n") + "\n";
  canonicalQueryString += "&X-Amz-SignedHeaders=" + signedHeaders.sort().join(";"); // <- TODO: figure out if this is the right delimiter

  canonicalRequest += canonicalQueryString + "\n";

  //    iv. Canonical Headers
  canonicalRequest += canonicalHeaderStr + "\n";
  canonicalRequest +=  "\n"; // <- TODO: figure out what to put here 

  //    v. Signed Headers
  canonicalRequest += signedHeaders.sort().join(";") + "\n";

  //    vi. Unsigned Payload
  canonicalRequest += "UNSIGNED-PAYLOAD";
  
  // 1b. StringToSign
  var stringToSign = "";

  // algorithm
  stringToSign += amzAlgorithm + "\n";

  // date
  stringToSign += timestamp + "\n";

  // scope
  stringToSign += dateStr + "/" + region + "/" + "s3" + "/" + "aws4_request" + "\n";

  // hexed and hashed
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, canonicalRequest, Utilities.Charset.UTF_8);
  var digestStr = this.bytearrayToHex_(digest);

  stringToSign += digestStr;
  
  // 2. SigningKey
  // NOTE: We have to use the CryptoJS.HmacSHA256 here because it's broken with Utilities.computeHmacSha256Signature
  // TODO: figure out exactly why this is so ^
  
  // var dateKey = this.unsignBytearray_(Utilities.computeHmacSha256Signature(dateStr, "AWS4" + this.service.secretAccessKey, Utilities.Charset.UTF_8));
  // Logger.log("dateKey:\n" + this.bytearrayToHex_(dateKey));
  // var dateRegionKey = this.unsignBytearray_(Utilities.computeHmacSha256Signature(region, dateKey, Utilities.Charset.UTF_8));
  // var dateRegionServiceKey = this.unsignBytearray_(Utilities.computeHmacSha256Signature("s3", dateRegionKey, Utilities.Charset.UTF_8));
  // var signingKey = this.unsignBytearray_(Utilities.computeHmacSha256Signature("aws4_request", dateRegionServiceKey, Utilities.Charset.UTF_8));
  // Logger.log("SigningKey:\n" + this.bytearrayToHex_(signingKey));

  var signingKey = this.getSignatureKey_(this.service.secretAccessKey, dateStr, region, "s3");


  // 3. Signature

  var signature = CryptoJS.HmacSHA256(stringToSign, signingKey, { asBytes: true });
  
  if (mode == "signature") {
    return signature;
  }

  var url = this.getUrl();
  url += "?" + canonicalQueryString
  url += "&X-Amz-Signature=" + signature;

  url = url.replace(/ /g, "%20");

  return url;
};


/* convert an array of signed bytes to hex encoding
 * @author David Su <david.d.su@gmail.com>
 *
 * @private
 * @param {Array} byteArr the array of bytes
 * @return {string} the hex-encoded string
 */
S3Request.prototype.bytearrayToHex_ = function(byteArr) {
  var hexStr = "";
  for (var i=0; i<byteArr.length; i++) {
    var b = byteArr[i];
    if (b < 0) {
      b += 256;
    }
    var bStr = b.toString(16);
    if (bStr.length == 1) {
      bStr = "0" + bStr;
    }
    hexStr += bStr;
  }
  return hexStr;
};

/* convert an array of signed bytes to unsigned bytes
 * @author David Su <david.d.su@gmail.com>
 *
 * @private
 * @param {Array} byteArr the array of bytes
 * @return {Array} the array of unsigned bytes
 */
S3Request.prototype.unsignBytearray_ = function(byteArr) {
  for (var i=0; i<byteArr.length; i++) {
    if (byteArr[i] < 0) {
      byteArr[i] += 256;
    }
  }
  return byteArr;
};

/* calculate the key used to sign signature according to AWS Signature v4
 * from the examples at http://docs.aws.amazon.com/general/latest/gr/signature-v4-examples.html
 * NOTE: make sure asBytes is set to true!
 *
 * @private
 * @param {string} key base64-encoded key
 * @param {string} dateStamp the date in format <yyyymmdd>
 * @param {string} regionName name of the region, e.g. "us-east-1"
 * @param {string} serviceName name of the service, e.g. "s3" or "iam"
 * @return {string} base64-encoded signing key
 */
S3Request.prototype.getSignatureKey_ = function(key, dateStamp, regionName, serviceName) {
   var kDate = CryptoJS.HmacSHA256(dateStamp, "AWS4" + key, { asBytes: true})
   var kRegion = CryptoJS.HmacSHA256(regionName, kDate, { asBytes: true });
   var kService = CryptoJS.HmacSHA256(serviceName, kRegion, { asBytes: true });
   var kSigning = CryptoJS.HmacSHA256("aws4_request", kService, { asBytes: true });

   return kSigning;
};

/* computes Authorization Header value for S3 request
 * reference http://docs.aws.amazon.com/AmazonS3/latest/dev/RESTAuthentication.html
 *
 * @private
 * @return {string} base64 encoded HMAC-SHA1 signature of request (see AWS Rest auth docs for details)
 */
S3Request.prototype.getAuthHeader_ = function () {
    
  var signature = this.authenticate({}, "signature");
      
  return "AWS " + this.service.accessKeyId + ':' + signature; 
};

/* calculates Md5 for the content (http request body) of the S3 request
 *   (Content-MD5 on S3 is recommended, not required; so can change this to return "" if it's causing problems - likely due to charset mismatches)
 * 
 * @private
 * @return {string} base64 encoded MD5 hash of content
 */
S3Request.prototype.getContentMd5_ = function() {
  if (this.content.length > 0) {
    return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, this.content, Utilities.Charset.UTF_8));
  } else {
    return ""; 
  }
};
