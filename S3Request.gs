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
  if (typeof contentType != 'string') throw 'contentType must be passed as a string';
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
  if (typeof content != 'string') throw 'content must be passed as a string'
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

S3Request.prototype.getSignedUrl = function(options) {
  var url = this.getUrl();
  var accessKeyId = this.service.accessKeyId;
  var expires = 86400;
  if ( !("expires" in options) ) {
    // expires = options["expires"];
    options["expires"] = expires;
  }
  // expires += Math.round(Date.now() / 1000);
  // options["expires"] = expires;
  var signature = this.calculateSignature_(options);

  return signature;

  // url += "?AWSAccessKeyId=" + accessKeyId;
  // url += "&Expires=" + expires;
  // url += "&Signature=" + signature;

  // return url;
}

S3Request.prototype.calculateSignature_ = function(options) {

  // var options = this.service.options;
  // Logger.log("Options:\n" + JSON.stringify(options));

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
  canonicalizedResource = encodeURIComponent(canonicalizedResource).replace("%2F", "/");
  canonicalRequest += canonicalizedResource + "\n";

  //    iii. Canonical Query String
  var canonicalQueryString = "";
  var qsDelimiter = "%2F"

  //          - algorithm
  var amzAlgorithm = "AWS4-HMAC-SHA256";
  canonicalQueryString += "X-Amz-Algorithm=" + amzAlgorithm;

  //          - credentials
  var date = new Date();
  if (options && "signatureTesting" in options && options.signatureTesting == true) {
      date = new Date(Date.UTC("2013", "05", "24")); // testing
  }
  var dateStr = date.getUTCFullYear() + ("0" + (date.getUTCMonth()+0) ).slice(-2) + ("0" + date.getUTCDate()).slice(-2)
  var region = "us-east-1"; // default region
  if (options.hasOwnProperty("region")) {
    region = options.region;
  }
  canonicalQueryString += "&X-Amz-Credential=" + this.service.accessKeyId + qsDelimiter + dateStr + qsDelimiter + region + qsDelimiter + "s3" + qsDelimiter + "aws4_request";

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
  var headerStr;

  for (var headerName in this.headers) {
    // only AMZ headers
    // convert to lower case (1)
    // multi-line headers to single line (4)
    // one space after : (5)
    if (headerName.match(/^x-amz/i)) {
      var header = headerName.toLowerCase() + ":" + this.headers[headerName].replace(/\s+/, " ");
      amzHeaders.push(header);
      signedHeaders.push(headerName.toLowerCase());
    }
  }

  headerStr = amzHeaders.sort().join("\n");
  canonicalQueryString += "&X-Amz-SignedHeaders=" + signedHeaders.sort().join(";"); // <- TODO: figure out if this is the right delimiter


  canonicalRequest += canonicalQueryString + "\n";

  //    iv. Canonical Headers
  canonicalRequest += headerStr + "\n";
  canonicalRequest +=  "\n"; // <- TODO: figure out what to put here


  //    v. Signed Headers
  canonicalRequest += signedHeaders.sort().join(";") + "\n";

  
  //    vi. Unsigned Payload
  canonicalRequest += "UNSIGNED-PAYLOAD";
  Logger.log("CanonicalRequest:\n" + canonicalRequest);



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
  Logger.log("StringToSign:\n" + stringToSign);

  // stringToSign = "AWS4-HMAC-SHA256\n20130524T000000Z\n20130524/us-east-1/s3/aws4_request\n3bfa292879f6447bbcda7001decf97f4a54dc650c8942174ae0a9121cf58ad04";


  // 2. SigningKey
  // NOTE: We have to use the CryptoJS.HmacSHA256 here because it's broken with Utilities.computeHmacSha256Signature
  // TODO: figure out exactly why this is so ^
  
  // var dateKey = this.unsignBytearray_(Utilities.computeHmacSha256Signature(dateStr, "AWS4" + this.service.secretAccessKey, Utilities.Charset.UTF_8));
  // Logger.log("dateKey:\n" + this.bytearrayToHex_(dateKey));
  // var dateRegionKey = this.unsignBytearray_(Utilities.computeHmacSha256Signature(region, dateKey, Utilities.Charset.UTF_8));
  // var dateRegionServiceKey = this.unsignBytearray_(Utilities.computeHmacSha256Signature("s3", dateRegionKey, Utilities.Charset.UTF_8));
  // var signingKey = this.unsignBytearray_(Utilities.computeHmacSha256Signature("aws4_request", dateRegionServiceKey, Utilities.Charset.UTF_8));
  // Logger.log("SigningKey:\n" + this.bytearrayToHex_(signingKey));

  signingKey = this.getSignatureKey_(this.service.secretAccessKey, dateStr, region, "s3");
  Logger.log("SigningKey:\n" + signingKey.toString());


  // 3. Signature
  
  // var signature = this.bytearrayToHex_(Utilities.computeHmacSha256Signature(stringToSign, signingKey, Utilities.Charset.UTF_8));
  // Logger.log("Signature:\n" + signature);

  var signature = CryptoJS.HmacSHA256(stringToSign, signingKey, { asBytes: true });
  Logger.log("Signature:\n" + signature.toString());

  // return signature;

  var url = this.getUrl();
  url += "?" + canonicalQueryString
  url += "&X-Amz-Signature=" + signature;
  return url;

  // OLD VERSION

  /*
  //  StringToSign = HTTP-VERB + "\n" +
  //    Content-MD5 + "\n" +
  //    Content-Type + "\n" +
  //    Date + "\n" +
  //    CanonicalizedAmzHeaders +
  //    CanonicalizedResource;    
    var stringToSign = this.httpMethod + "\n";
  
  var contentLength = this.content.length;
  stringToSign += this.getContentMd5_() + "\n" ;
  stringToSign += this.getContentType() + "\n";

  
  //set expires time 60 seconds into future
  stringToSign += this.date.toUTCString() + "\n";


  // Construct Canonicalized Amazon Headers
  //http://docs.aws.amazon.com/AmazonS3/latest/dev/RESTAuthentication.html#RESTAuthenticationRequestCanonicalization
  var amzHeaders = [];
  
  for (var headerName in this.headers) {
    // only AMZ headers
    // convert to lower case (1)
    // multi-line headers to single line (4)
    // one space after : (5)
    if (headerName.match(/^x-amz/i)) {
      var header = headerName.toLowerCase() + ":" + this.headers[headerName].replace(/\s+/, " ");
      amzHeaders.push(header) 
    }
  }
  // (3) is just that multiple values of the same header must be passed as CSV, rather than listed multiple times; implicit
  // sort lexographically (2), and combine into string w single \n separating each (6)
  if (amzHeaders.length > 0) {
    stringToSign += amzHeaders.sort().join("\n") + "\n";
  }
  
  var canonicalizedResource = "/" + this.bucket.toLowerCase() + this.getUrl().replace("http://"+this.bucket.toLowerCase()+".s3.amazonaws.com","");
  stringToSign += canonicalizedResource;
  
  //  Logger.log("-- string to sign --\n"+stringToSign);
  
  //Signature = Base64( HMAC-SHA1( YourSecretAccessKeyID, UTF-8-Encoding-Of( StringToSign ) ) );  
  var signature = Utilities.base64Encode(Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1, 
                                                                        stringToSign, 
                                                                        this.service.secretAccessKey, 
                                                                        Utilities.Charset.UTF_8));

  return signature;
  */
};

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

S3Request.prototype.unsignBytearray_ = function(byteArr) {
  for (var i=0; i<byteArr.length; i++) {
    if (byteArr[i] < 0) {
      byteArr[i] += 256;
    }
  }
  return byteArr;
};

S3Request.prototype.getSignatureKey_ = function(key, dateStamp, regionName, serviceName) {

   var kDate= CryptoJS.HmacSHA256(dateStamp, "AWS4" + key, { asBytes: true})
   var kRegion= CryptoJS.HmacSHA256(regionName, kDate, { asBytes: true });
   var kService=CryptoJS.HmacSHA256(serviceName, kRegion, { asBytes: true });
   var kSigning= CryptoJS.HmacSHA256("aws4_request", kService, { asBytes: true });

   return kSigning;
};

/* computes Authorization Header value for S3 request
 * reference http://docs.aws.amazon.com/AmazonS3/latest/dev/RESTAuthentication.html
 *
 * @private
 * @return {string} base64 encoded HMAC-SHA1 signature of request (see AWS Rest auth docs for details)
 */
S3Request.prototype.getAuthHeader_ = function () {
    
  var signature = this.calculateSignature_();
      
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
