var googleAuth = (function () {

  function installClient() {
    var apiUrl = 'https://apis.google.com/js/api.js'
    return new Promise((resolve) => {
      var script = document.createElement('script')
      script.src = apiUrl
      script.onreadystatechange = script.onload = function () {
        if (!script.readyState || /loaded|complete/.test(script.readyState)) {
          setTimeout(function () {
            resolve()
          }, 500)
        }
      }
      document.getElementsByTagName('head')[0].appendChild(script)
    })
  }
  
  /** opens a popup window in the center of the parent window */
  function popupWindow(url, windowName, w, h, win = window) {
    const y = win.top.outerHeight / 2 + win.top.screenY - ( h / 2);
    const x = win.top.outerWidth / 2 + win.top.screenX - ( w / 2);
    return win.open(url, windowName, `toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=no, resizable=no, copyhistory=no, width=${w}, height=${h}, top=${y}, left=${x}`);
  }

  function gup(url, name) {
    name = name.replace(/[[]/,"\[").replace(/[]]/,"\]");
    var regexS = "[\?&]"+name+"=([^&#]*)";
    var regex = new RegExp( regexS );
    var results = regex.exec( url );
    if( results == null )
      return "";
    else
      return results[1];
  }

  function initClient(config) {
    return new Promise((resolve, reject) => {
      window.gapi.load('auth2', () => {
        window.gapi.auth2.init(config)
          .then(() => {
            resolve(window.gapi)
          }).catch((error) => {
            reject(Object.assign(error, { api: window.gapi }))
          })
      })
    })

  }
  function Auth() {
    if (!(this instanceof Auth))
      return new Auth()
    this.GoogleAuth = null /* window.gapi.auth2.getAuthInstance() */
    this.isAuthorized = false
    this.isInit = false
    this.prompt = null
    this.config = null
    this.cookiesDisabled = false
    this.isLoaded = function () {
      /* eslint-disable */
      console.warn('isLoaded() will be deprecated. You can use "this.$gAuth.isInit"')
      return !!this.GoogleAuth
    };

    this.load = (config, prompt) => {
      this.config = config
      installClient()
        .then(() => {
          return initClient(config)
        })
        .then((gapi) => {
          this.GoogleAuth = gapi.auth2.getAuthInstance()
          this.isInit = true
          this.prompt = prompt
          this.isAuthorized = this.GoogleAuth.isSignedIn.get()
        }).catch((error) => {
          if (error.details && error.details.includes("Cookies are not enabled") || error.details.includes("sessionStorage")) {
            this.cookiesDisabled = true
            this.GoogleAuth = error.api.auth2.getAuthInstance()
          }
          if (process.env.NODE_ENV === 'development') console.error(error)
        })
    };
    
    /** this is used when cookies are disabled in the current environment (such as in incognito mode by default now)
        a window is created similar to the regular google auth, with a url created from the registered parameters
        after login and consent, the url will update and is essentially passed back to the application
        no redirect on main window is needed :) */
    this.alternateLogin = () => {
      return new Promise((resolve, reject) => {
        
        /** default google values */
        const window_width = 600
        const window_height = 600
        /** custom params */
        const scope = "openid%20profile%20email&openid.realm" || this.config.scope // these params work for getting profile and name
        const access_type = 'offline'
        const response_type = "code%20permission" || this.config.response_type // code and permission needed for backend request of tokens
        const state = 'test_state_value_12345' // need a state value in order to validate final request
        const redirect_uri = this.config.redirect_uri // set to base url
        const client_id = this.config.client_id
        const _url = `https://accounts.google.com/o/oauth2/v2/auth?scope=${scope}&prompt=consent&include_granted_scopes=true&access_type=${access_type}&response_type=${response_type}&state=${state}&redirect_uri=${redirect_uri}&client_id=${client_id}`
        var win = popupWindow(_url, 'windowname1', window_width, window_height)
        
        var pollTimer = window.setInterval(function() { 
          try {
            if (win.document.URL.indexOf(redirect_uri) != -1) {
              window.clearInterval(pollTimer);
              var url = win.document.URL;
              const authCode = gup(url, 'code');
              const state = gup(url, 'state');
              win.close();
              resolve(authCode)
            }
          } catch(e) {
          }
        }, 100);
      })
    }

    this.signIn = (successCallback, errorCallback) => {
      return new Promise((resolve, reject) => {
        if (!this.GoogleAuth) {
          if (typeof errorCallback === 'function') errorCallback(false)
          reject(false)
          return
        }
        this.GoogleAuth.signIn()
          .then(googleUser => {
            if (typeof successCallback === 'function') successCallback(googleUser)
            this.isAuthorized = this.GoogleAuth.isSignedIn.get()
            resolve(googleUser)
          })
          .catch(error => {
            if (typeof errorCallback === 'function') errorCallback(error)
            reject(error)
          })
      })
    };

    this.getAuthCode = (successCallback, errorCallback) => {
      return new Promise((resolve, reject) => {
        if (!this.GoogleAuth) {

          if (typeof errorCallback === 'function') errorCallback(false)
          reject(false)
          return
        }
        /** use alternate auth flow */
        if (this.cookiesDisabled) {
          this.alternateLogin()
            .then((resp) => {
              if (typeof successCallback === 'function') successCallback(resp)
              resolve(resp)
            }).catch((err) => {
              if (typeof errorCallback === 'function') errorCallback(err)
              reject(err)
            })
        } else {
          this.GoogleAuth.grantOfflineAccess({ prompt: this.prompt })
            .then(function (resp) {
              if (typeof successCallback === 'function') successCallback(resp.code)
              resolve(resp.code)
            })
            .catch(function (error) {
              if (typeof errorCallback === 'function') errorCallback(error)
              reject(error)
              if (typeof errorCallback === 'function') errorCallback(error)
              reject(error)
            })
          }
        })
    };

    this.signOut = (successCallback, errorCallback) => {
      return new Promise((resolve, reject) => {
        if (!this.GoogleAuth) {
          if (typeof errorCallback === 'function') errorCallback(false)
          reject(false)
          return
        }
        this.GoogleAuth.signOut()
          .then(() => {
            if (typeof successCallback === 'function') successCallback()
            this.isAuthorized = false
            resolve(true)
          })
          .catch(error => {
            if (typeof errorCallback === 'function') errorCallback(error)
            reject(error)
          })
      })
    };
  }

  return new Auth()
})();




function installGoogleAuthPlugin(Vue, options) {
  /* eslint-disable */
  //set config
  let GoogleAuthConfig = null
  let GoogleAuthDefaultConfig = { scope: 'profile email' }
  let prompt = 'select_account'
  if (typeof options === 'object') {
    GoogleAuthConfig = Object.assign(GoogleAuthDefaultConfig, options)
    if (options.scope) GoogleAuthConfig.scope = options.scope
    if (options.prompt) prompt = options.prompt
    if (options.cookie_policy) GoogleAuthConfig.cookie_policy = options.cookie_policy
    if (options.redirect_uri) GoogleAuthConfig.redirect_uri = options.redirect_uri
    if (options.ux_mode) GoogleAuthConfig.ux_mode = options.ux_mode
    if (!options.clientId) {
      console.warn('clientId is required')
    }
  } else {
    console.warn('invalid option type. Object type accepted only')
  }

  //Install Vue plugin
  Vue.gAuth = googleAuth
  Object.defineProperties(Vue.prototype, {
    $gAuth: {
      get: function () {
        return Vue.gAuth
      }
    }
  })
  Vue.gAuth.load(GoogleAuthConfig, prompt)
}

export default installGoogleAuthPlugin