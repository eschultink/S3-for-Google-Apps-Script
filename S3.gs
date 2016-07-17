/* 
 * very basic AWS S3 Client library for Google Apps Script
 * @author Erik Schultink <erik@engetc.com>
 * includes create/delete buckets, create/read/delete objects. very limited support for any optional params.
 * 
 * @see http://engetc.com/projects/amazon-s3-api-binding-for-google-apps-script/
 */

/**
 * @license Copyright 2014-15 Eng Etc LLC - All Rights Reserved
 *
 * LICENSE (Modified BSD) - Redistribution and use in source and binary forms, with or without modification, 
 * are permitted provided that the following conditions are met:
 *   1) Redistributions of source code must retain the above copyright notice, this list of conditions and 
 *      the following disclaimer.
 *   2) Redistributions in binary form must reproduce the above copyright notice, this list of conditions 
 *      and the following disclaimer in the documentation and/or other materials provided with the 
 *      distribution.
 *   3) Neither the name of the Eng Etc LLC, S3-for-Google-Apps-Script, nor the names of its contributors may be used to endorse or 
 *      promote products derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED 
 * WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A 
 * PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL ENG ETC LLC BE LIABLE FOR ANY DIRECT, INDIRECT, 
 * INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF 
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED 
 * AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR 
 * OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF 
 * SUCH DAMAGE.
 */

//Body of the library


/* constructs an S3 service
 *
 * @constructor
 * @param {string} accessKeyId your AWS AccessKeyId
 * @param {string} secretAccessKey your AWS SecretAccessKey
 * @param {Object} options key-value object of options, unused
 *
 * @return {S3}
 */
function getInstance(accessKeyId, secretAccessKey, options) {
  return new S3(accessKeyId, secretAccessKey, options);
}

/* constructs an S3 service
 *
 * @constructor
 * @param {string} accessKeyId your AWS AccessKeyId
 * @param {string} secretAccessKey your AWS SecretAccessKey
 * @param {Object} options key-value object of options, unused
 */
function S3(accessKeyId, secretAccessKey, options) {
  if (typeof accessKeyId !== 'string') throw "Must pass accessKeyId to S3 constructor";
  if (typeof secretAccessKey !== 'string') throw "Must pass secretAcessKey to S3 constructor";
  
  this.accessKeyId = accessKeyId;
  this.secretAccessKey = secretAccessKey;
  this.options = options | {};
}



/* creates bucket in S3
 *
 * @param {string} bucket name of bucket
 * @param {Object} options optional parameters to create request; supports x-amz-acl
 * @throws {Object} AwsError on failure
 * @return void
 */
S3.prototype.createBucket = function (bucket, options) {
  options = options || {}; 
  
  
  var request = new S3Request(this);
  request.setHttpMethod('PUT');
  
  //this is dumb and is optional from AWS perspective
  //but UrlFetchApp will default a Content-Type header to application/xml-www-form-url-encoded or whatever, which 
  //screws up the signature of the request
  request.setContentType('text/plain');
  
  //support setting of ACL
  if (typeof options["x-amz-acl"] == 'undefined') {
    options["x-amz-acl"] = "private";
  }
  request.addHeader("x-amz-acl", options["x-amz-acl"]);
  
  request.setBucket(bucket);
  
  request.execute(options);
  
};

/* deletes bucket from S3 
 *
 * @param {string} bucket name of bucket
 * @param {Object} options optional parameters to delete request
 * @throws {Object} AwsError on failure
 * @return void
 */
S3.prototype.deleteBucket = function (bucket, options) {
  options = options || {};

  var request = new S3Request(this);
  request.setHttpMethod('DELETE');
  
  request.setBucket(bucket);
  request.execute(options);
};

/* puts an object into S3 bucket
 * 
 * @param {string} bucket 
 * @param {string} objectName name to uniquely identify object within bucket
 * @param {string} object byte sequence that is object's content
 * @param {Object} options optional parameters
 * @throws {Object} AwsError on failure
 * @return void
 */
S3.prototype.putObject = function (bucket, objectName, object, options) {
  options = options || {};

  var request = new S3Request(this);
  request.setHttpMethod('PUT');
  request.setBucket(bucket);
  request.setObjectName(objectName);
  
  var failedBlobDuckTest = !(typeof object.copyBlob == 'function' &&
                      typeof object.getDataAsString == 'function' &&
                      typeof object.getContentType == 'function'
                      );
  
  //wrap object in a Blob if it doesn't appear to be one
  if (failedBlobDuckTest) {
    object = Utilities.newBlob(JSON.stringify(object), "application/json");
    object.setName(objectName);
  }
  
  request.setContent(object.getDataAsString());
  request.setContentType(object.getContentType());
  
  request.execute(options);  
};

/* gets object from S3 bucket
 *
 * @param {string} bucket name of bucket
 * @param {string} objectName name that uniquely identifies object within bucket
 * @param {Object} options optional parameters for get request (unused)
 * @throws {Object} AwsError on failure
 * @return {Blob|Object} data value, converted from JSON or as a Blob if it was something else; null if it doesn't exist
 */
S3.prototype.getObject = function (bucket, objectName, options) {
  options = options || {};
  
  var request = new S3Request(this);
  request.setHttpMethod('GET');
  
  request.setBucket(bucket);
  request.setObjectName(objectName);
  try {
    var responseBlob = request.execute(options).getBlob();
  } catch (e) {
    if (e.name == "AwsError" && e.code == 'NoSuchKey') {
      return null;
    } else {
      //some other type of error, rethrow
      throw e; 
    }
  }
  
  //not sure this is better to put here, rather than in S3Request class
  if (responseBlob.getContentType() == "application/json") {
     return JSON.parse(responseBlob.getDataAsString());
  }
  return responseBlob;
};

/* deletes object from S3 bucket
 *
 * @param {string} bucket bucket name
 * @param {string} objectName name that uniquely identifies object within bucket
 * @param {Object} options optional parameters to delete request, unused
 * @throws {Object} AwsError on failure
 * @return void
 */
S3.prototype.deleteObject = function (bucket, objectName, options) {
  options = options || {};  
  
  var request = new S3Request(this);
  request.setHttpMethod('DELETE');
  
  request.setBucket(bucket);
  request.setObjectName(objectName);
  
  request.execute(options);  
};


S3.prototype.getSignedUrl = function(bucket, objectName, options) {
  options = options || {};
  
  var request = new S3Request(this);
  request.setHttpMethod('GET');
  
  request.setBucket(bucket);
  request.setObjectName(objectName);

  // return request.calculateSignature_(options);
  return request.getSignedUrl(options);
}

//for debugging
S3.prototype.getLastExchangeLog = function() {
  return this.lastExchangeLog; 
}

/*
 * helper to format log entry about HTTP request/response
 * 
 * @param {Object} request object, from UrlFetchApp.getRequest()
 * @param {goog.HTTPResponse} response object, from UrlFetchApp
 */
S3.prototype.logExchange_ = function(request, response) {
  var logContent = "";
  logContent += "\n-- REQUEST --\n";
  for (i in request) {
    if (typeof request[i] == 'string' && request[i].length > 1000) {
      //truncate to avoid making log unreadable
      request[i] = request[i].slice(0, 1000) + " ... [TRUNCATED]"; 
    }
    logContent += Utilities.formatString("\t%s: %s\n", i, request[i]);
  }
    
  logContent += "-- RESPONSE --\n";
  logContent += "HTTP Status Code: " + response.getResponseCode() + "\n";
  logContent += "Headers:\n";
  
  var headers = response.getHeaders();
  for (i in headers) {
    logContent += Utilities.formatString("\t%s: %s\n", i, headers[i]);
  }
  logContent += "Body:\n" + response.getContentText();
  this.lastExchangeLog = logContent;
}

