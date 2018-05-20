FROM node
MAINTAINER shuai <tianshuai@bimsop.com>

#http://bitjudo.com/blog/2014/03/13/building-efficient-dockerfiles-node-dot-js/
# use changes to package.json to force Docker not to use the cache
# when we change our application's nodejs dependencies:
ADD package.json /tmp
RUN cd /tmp && npm install
RUN mkdir -p /home/peacock/server && cp -a /tmp/node_modules /home/peacock/server/

WORKDIR /home/peacock/server

ADD . /home/peacock/server

EXPOSE 7403

CMD ["npm", "start"]
