/**
 * Test and Demo functions for the library
 *
 * demo* functions run individual methods, but don't verify results (eg for debugging)
 *
 * runTests executes a serious of test of the main methods, and throws an exception if there's a failure
 *
 */


/** @const {string} name of test bucket (remember all S3 buckets must be GLOBALLY unique) **/
var bucketName_ = "S3LibraryTestBucket";

/**
 * DEMO FUNCTIONS - useful for debugging; commented out to not clutter tab-completion list
 */
//function demoCreateBucket() {
//  var env = getTestEnv();
//  var service = new S3(env.awsAccessKeyId, env.awsSecretKey);
//  service.createBucket(bucketName_);
//}
//
//function demoDeleteBucket() {
//  var env = getTestEnv();
//  var service = new S3(env.awsAccessKeyId, env.awsSecretKey);
//   service.deleteBucket(bucketName_);
//}
//
//function demoPutObject() {
//  var env = getTestEnv();
//  var service = new S3(env.awsAccessKeyId, env.awsSecretKey);
//  service.putObject(bucketName_, "objectFoo", "blah ObjectContent blah");
//}
//
//function demoGetObject() {
//  var env = getTestEnv();
//  var service = new S3(env.awsAccessKeyId, env.awsSecretKey);
//  var value = service.getObject(bucketName_, "objectFoo");
//  Logger.log(value);
//}  
//
//function demoDeleteObject() {
//  var env = getTestEnv();
//  var service = new S3(env.awsAccessKeyId, env.awsSecretKey);
//  service.deleteObject(bucketName_, "objectFoo");
//}

/**
 * executes tests of the library. throws exceptions if any fails
 * (tests can't run locally in this file, bc require Amazon credentials to be defined - which they of course
 *  shouldn't be in a public script file)
 */
function runTests() {
  Logger.log("START tests. should end with ALL TESTS PASSED.");
  var env = getTestEnv();
  var service = new S3(env.awsAccessKeyId, env.awsSecretKey);
  var objectName = "objectFoo";
  var blobObjectName = "blobtest";
  var options = {
//    logRequests:true
  };
  
  //clean up existing object, bucket if exist
  try {
    service.deleteObject(bucketName_, objectName, options);
  } catch (e) {
    Logger.log(e);
  }
  
  try {
    service.deleteObject(bucketName_, blobObjectName, options);
  } catch (e) {
    Logger.log(e); 
  }
  try {
    service.deleteBucket(bucketName_, options);
  } catch (e) {
    Logger.log(e);
  }
  
 
  //get object from non-existent bucket (should fail)

  var checkExpectedError = function (expectedErrorCode, e) {
    Logger.log("caught exception: %s", e.toString());
    if (e.name == 'AwsError' && e.code == expectedErrorCode) {
      Logger.log("expected error occurred");
      return true;
    } else { 
      Logger.log("An error occurred, but not the expected one"); 
      throw e;
    }
  };
  
  var fail = false;  
  try {
    var r = service.getObject(bucketName_, objectName, options);
  } catch (e) {
    fail = checkExpectedError("NoSuchBucket", e);
  }
  if (!fail) {
    throw "request to get object from non-existent bucket succeeded; wtf";      
  }  
  Logger.log("PASSED get object from non-existent bucket");
  
  
  //put object into non-existent bucket (should fail)
  var fail = false;
  try {
    service.putObject(bucketName_, objectName, "blah", options);
  } catch (e) {
    fail = checkExpectedError("NoSuchBucket", e);
  }
  if (!fail) {
     throw "request to put object into non-existing bucket succeeded; wtf"; 
  }
  Logger.log("PASSED put object into non-existent bucket");
 
  //delete non-existent bucket
  var fail = false;
  try {
    service.deleteBucket(bucketName_, options); 
  } catch (e) {
    fail = checkExpectedError("NoSuchBucket", e);  
  }
  if (!fail) {
     throw "request to delete non-existent bucket succeeded; wtf"; 
  }  
  Logger.log("PASSED delete non-existent bucket");
 
  //create a bucket
  service.createBucket(bucketName_, options);
  Logger.log("PASSED create bucket");
  
  //get non-existent object from existing bucket (should return null)
  var r = service.getObject(bucketName_, objectName, options);
  if (r !== null) {
    throw "found object that should not exist";
  } 
  Logger.log("PASSED get non-existent object from existing bucket");
  
  //put object into bucket
  var content = "blah";
  service.putObject(bucketName_, objectName, content, options);
  Logger.log("PASSED put object");
  
  
  //get object
  var r = service.getObject(bucketName_, objectName, options);
  if (r !== content) {
    throw "S3 object content does not match what was put in";
  }
  Logger.log("PASSED get object");
  
  
  //put/get a Blob, to make sure deals w this OK
  var blob = UrlFetchApp.fetch("http://www.google.com").getBlob();
  service.putObject(bucketName_, blobObjectName, blob, options);
  var retrievedBlob = service.getObject(bucketName_, blobObjectName, options);
  if (!(retrievedBlob.getContentType() ==  blob.getContentType() && 
      retrievedBlob.getDataAsString() == blob.getDataAsString())) {
    throw "test to set html Blob into S3 and retrieve it failed"; 
  }
  Logger.log("PASSED put/get Blob object");
  
  Logger.log("-------------\nALL TESTS PASSED");
}
