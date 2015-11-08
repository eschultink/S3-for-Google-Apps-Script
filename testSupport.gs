/** @define {string} */
var TEST_ENV_NAME_ = "S3LibraryTestEnv";

// todo: consider splitting into a generic testing lib?

/**
 * sets a testing Env, that's accessible from test and demo functios; and persistent for user
 * 
 * @param {Object} env the environment object to set for testing (should have awsAccessKeyId, awsSecretKey as properties)
 * @return {void}
 */
function setTestEnv(env) {
  var userProperties = PropertiesService.getUserProperties();
  userProperties.setProperty(TEST_ENV_NAME_, JSON.stringify(env))
  //just to this to check
  var env = getTestEnv();
}

/**
 * gets Test Env for the library, optionally skipping validing that all req constants are defined in that env
 *
 * @param {boolean}  
 * @return {Object} key-value for the environment
 */
function getTestEnv(skipEnvValidation) {
  var propertiesService = PropertiesService.getUserProperties();
  Logger.log(propertiesService.getProperty);
  var env = JSON.parse(propertiesService.getProperty(TEST_ENV_NAME_)) 
  if (!skipEnvValidation) {
    var requiredKeys = ["awsAccessKeyId", "awsSecretKey"];
    
    if (env == null) {
      throw "Must set environment in UserProperties (see setTestEnvFromUI)"; 
    }
  
    for (var i=0, len=requiredKeys.length; i < len; i++) {
      if (typeof env[requiredKeys[i]] == 'undefined') {
        throw "Test Environment is missing required property '" + requiredKeys[i] + "'.  Define it object passed to setTestEnv().";
      }
    }
  }
  return env;
}
