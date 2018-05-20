'use strict';
var request = require('request');
var md5 = require('md5');
var axios = require('axios');
var config = require('../../server/config.local.js');
var AES = require('crypto-js/aes');

module.exports = function(Fmuser) {
  var baseUFUrl = 'http://file.helloufu.com/?c=Port&m=actionGet_Web_v2_Port&shop_id=4';
  var peacockUrl = config.peacockUrl;

  Fmuser.disableRemoteMethodByName('login');
  Fmuser.disableRemoteMethodByName('create');
  Fmuser.disableRemoteMethodByName('upsert');
  Fmuser.disableRemoteMethodByName('deleteById');
  Fmuser.disableRemoteMethodByName('updateAll');
  Fmuser.disableRemoteMethodByName('prototype.updateAttributes');

  var methodsArr = ['FmUser.createFolder','FmUser.getUserFiles','FmUser.getMonoObjects'];

  function getAccess(userId){
    return Fmuser.findById(userId)
      .then(function(user){
        var spaceId = user.PeacockToken.spaceId;
        var accessToken = user.PeacockToken.id;
        var ttl = user.PeacockToken.ttl;
        var created = user.PeacockToken.created;
        var token;
        if(new Date(created).getTime() + ttl < Date.now()){
          console.log('not ovd')
          return axios.post(peacockUrl + '/PeacockUsers/logInLimitedUser', {
            key: user.key,
            secret: user.secret
          })
            .then(result => {
              if(result.data.code === 401)
              {
                var e = {
                  statusCode: 401,
                  msg: '用户名没有注册'
                };
                return Promise.reject(e);
              }
              token = result.data.accessToken;
              return user.updateAttribute('PeacockToken', token);
            })
            .then(function(updatedUser){
              return Promise.resolve(updatedUser);
            });
        } else {
          return Promise.resolve(user);
        }
      })
      .catch(e=> {
        console.log(e)
        return Promise.reject(e)
      });
  }

  Fmuser.beforeRemote('**', function(ctx, user, next) {
    console.log(ctx.methodString, 'was invoked remotely, checking Access'); // customers.prototype.save was invoked remotely
    var isAccessRequired = methodsArr.some(function(item){
      return item === ctx.methodString;
    })
    if(isAccessRequired){
      getAccess(ctx.req.accessToken.userId)
        .then(user => {
          ctx.args.user = user;
          next()
        })
      .catch(next);
    }else{
      next();
    }
  });

  Fmuser.signIn = function(username, password, cb) {
    var user;
    //先找用户存不存在
    Fmuser.findOne({
      where: {
        username: username
      }
    })
      .then(function(result) {
        if (result) {
          user = result
        }
        return axios.get(
          baseUFUrl, {
            params: {
              module: 'Hqdb',
              opt: 'out_login',
              username: username,
              password: password
            }
          })
            .then(result => {
              var ufData = result.data
              var userFile = ufData.data[0]
              var token = userFile.token
              var pwd = AES.encrypt(password, 'hOIln23sE0917Z35p0')
              if (!user) {
                //优服登录成功后，如果用户本来不存在，就创建
                return Fmuser.create({
                  email: userFile.id + '@bimFm.com',
                  username: username,
                  password: password,
                  UFToken: token,
                  UFID: userFile.id,
                  icon: userFile.pic,
                  name: userFile.name,
                  pwd: pwd
                })
              } else {
                //优服登录成功后，如果本来用户存在，就更新数据
                return user.updateAttributes({
                  password: password,
                  UFToken: token,
                  icon: userFile.pic,
                  name: userFile.name,
                  pwd: pwd
                })
              }
            })
            .catch(err => {
              console.log(err)
              var e = new Error()
              e.statusCode = 401
              e.message = 'UFLogin Failed'
              return Promise.reject(e)
            })
      })
      .then(function(user) {
        //然后再登录
        return Fmuser.login({
          username: username,
          password: password
        })
          .then(function(result) {
            cb(null, result)
          })
      })
      .catch(cb)
  };

  Fmuser.remoteMethod(
    'signIn', {
      http: {
        path: '/signIn',
        verb: 'post'
      },
      accepts: [{
        arg: 'username',
        type: 'string'
      }, {
        arg: 'password',
        type: 'string'
      }],
      returns: [{
        arg: 'AccessToken',
        type: 'object'
      }],
      description: '登录'
    }
  );

  Fmuser.setPeacockToken = function(key, secret, ctx, cb) {
    var ssoUrl = config.ssoUrl;
    var userId = ctx.req.accessToken.userId;
    var user, token;
    Fmuser.findById(userId)
      .then(result => {
        if(!result){
          return Promise.reject({
            statusCode: 404,
            msg: 'no such user'
          })
        }
        user = result
        return axios.post(peacockUrl+ '/PeacockUsers/logInLimitedUser', {
          key: key,
          secret: secret
        })
      })
      .then(result => {
        if(result.data.code === 401)
        {
          var e = {
            statusCode: 401,
            msg: '用户名没有注册'
          };
          return Promise.reject(e);
        }
        token = result.data.accessToken;
        return user.updateAttributes({PeacockToken: token, key: key, secret: secret});
      })
      .then(() => {
        cb(null, {
          status: 'success',
          token: token
        })
      })
      .catch(cb)
  };

  Fmuser.remoteMethod(
    'setPeacockToken', {
      http: {
        path: '/setPeacockToken',
        verb: 'post'
      },
      accepts: [{
        arg: 'key',
        type: 'string'
      }, {
        arg: 'secret',
        type: 'string'
      }, {
        "arg": "ctx",
        "type": "object",
        "http": { source:'context' }
      }],
      returns: [{
        arg: 'status',
        type: 'string'
      }],
      description: '登录'
    }
  );

  Fmuser.getUserProject = function(req, cb){
    var userId = req.accessToken.userId;
    Fmuser.findById(userId)
      .then(user => {
        var UFID = user.UFID;
        return axios.get(baseUFUrl, {
          params: {
            module: 'Hqdb',
            opt: 'shop_login',
            out_userid: UFID
          }
        })
      })
      .then(result => {
        cb(null, result.data)
      })
      .catch(cb)
  };

  Fmuser.remoteMethod(
    'getUserProject', {
      http: {
        path: '/getUserProject',
        verb: 'get'
      },
      accepts: [{
        "arg": "req",
        "type": "object",
        "http": "optionsFromRequest"
      }],
      returns: [{
        arg: 'data',
        type: 'object'
      }],
      description: '获取用户的优服数据'
    }
  );


  Fmuser.createFolder = function(ctx, data, cb){
    var userId = ctx.req.accessToken.userId;
    var user = ctx.args.user;
    axios.post(peacockUrl + '/Spaces/' + user.PeacockToken.spaceId + '/UserFiles', {
        name: data.folderName,
        noExname: data.folderName,
        spaceId: user.PeacockToken.spaceId,
        father: data.father?data.father:'0',
        creator: user.name,
        type: 0
      },
      {
      params: {
        access_token: user.PeacockToken.id
      },
    })
      .then(result => {
        cb(null, result.data);
      })
      .catch(e => {
        if(e.response && e.response.data && e.response.status === 401){
          return cb(e.response.data);
        }else{
          cb(e);
        }
      });
  };

  Fmuser.remoteMethod(
    'createFolder', {
      http: {
        path: '/createFolder',
        verb: 'post'
      },
      accepts: [{
        "arg": "ctx",
        "type": "object",
        "http": { source:'context' }
      },{
        "arg": "data",
        "type": "object",
      }],
      returns: [{
        arg: 'data',
        type: 'object'
      }],
      description: '创建文件夹, data: {folderName: 文件夹名字, father: 父文件夹的id，没有则为空}'
    }
  );

  Fmuser.getUserFiles = function(ctx, filter, cb){
    var userId = ctx.req.accessToken.userId
    var user = ctx.args.user;
    axios.get(peacockUrl + '/Spaces/' + user.PeacockToken.spaceId + '/UserFiles', {
      params:{
        access_token: user.PeacockToken.id,
        filter: filter
      }
    })
      .then(result => {
        cb(null, result.data);
      })
      .catch(e => {
        console.log(e)
        cb(e.response.data);
      });
  };

  Fmuser.remoteMethod(
    'getUserFiles', {
      http: {
        path: '/getUserFiles',
        verb: 'get'
      },
      accepts: [{
        "arg": "ctx",
        "type": "object",
        "http": { source:'context' }
      },{
        "arg": "filter",
        "type": "object",
        "http": { source:'query' }
      }],
      returns: [{
        arg: 'data',
        type: 'object'
      }],
      description: '获取用户文件, father: 父级文件夹的id，若没有则为空'
    }
  );

  Fmuser.getMonoObjects = function(ctx, cb){
    var userId = ctx.req.accessToken.userId;
    var user = ctx.args.user;
    axios.get(peacockUrl + '/Spaces/' + user.PeacockToken.spaceId + '/monoObject', {
      params:{
        access_token: user.PeacockToken.id,
        filter: {
          include: "floors",
          order: 'created DESC'
        }
      }
    })
      .then(result => {
        cb(null, result.data);
      })
      .catch(e => {
        cb(e.response.data);
      });
  };

  Fmuser.remoteMethod(
    'getMonoObjects', {
      http: {
        path: '/getMonoObjects',
        verb: 'get'
      },
      accepts: [{
        "arg": "ctx",
        "type": "object",
        "http": { source:'context' }
      }],
      returns: [{
        arg: 'data',
        type: 'object'
      }],
      description: '获取空间单体'
    }
  );

  Fmuser.getCategories = function(cb){
    axios.get(peacockUrl + '/categories')
      .then(result => {
        cb(null, result.data)
      })
    .catch(cb)
  }

  Fmuser.remoteMethod(
    'getCategories', {
      http: {
        path: '/getCategories',
        verb: 'get'
      },
      returns: [{
        arg: 'data',
        type: 'object'
      }],
      description: '获取专业'
    }
  );

  Fmuser.getEvaluation = function(cb){
    axios.get(peacockUrl + '/evaluations')
      .then(result => {
        cb(null, result.data)
      })
    .catch(cb)
  }

  Fmuser.remoteMethod(
    'getEvaluation', {
      http: {
        path: '/getEvaluation',
        verb: 'get'
      },
      returns: [{
        arg: 'data',
        type: 'object'
      }],
      description: '获取标高体系'
    }
  );

};
