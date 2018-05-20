'use strict';

module.exports = function(Primitivecoderef) {

  Primitivecoderef.beforeRemote('create', function(ctx, modelInstance, next) {
    var userId = ctx.accessToken.userId;
    Primitivecoderef.app.models.FmUser.findById(userId)
      .then(function(user){
        ctx.args.data.spaceId = user.PeacockToken.spaceId;
        next();
      })
    .catch(next);
  });

  Primitivecoderef.beforeRemote('queryRef', function(ctx, modelInstance, next) {
    var userId = ctx.accessToken.userId;
    Primitivecoderef.app.models.FmUser.findById(userId)
      .then(function(user){
        ctx.args.spaceId = user.PeacockToken.spaceId;
        next();
      })
    .catch(next);
  })

  Primitivecoderef.queryRef = function(ctx, modelId, cb) {
    Primitivecoderef.find({
      where: {
        modelId: modelId,
        spaceId: ctx.args.spaceId
      }
    })
      .then(function(results){
        cb(null, results);
      })
      .catch(cb);
  };

  Primitivecoderef.remoteMethod(
    'queryRef',
    {
      http: {path: '/queryRef', verb: 'get'},
      accepts: [
        {arg: 'ctx', type: 'object', http: {'source': 'context'}},
        {arg: 'modelId', type: 'string'}
      ],
      returns: [{arg: 'results', type: 'array'}],
      description: '查询模型底下的图元对照数组'
    }
  );
};
