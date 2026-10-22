const cloudConfig=require('./utils/config').cloud;
App({onLaunch(){if(wx.cloud)wx.cloud.init({env:cloudConfig.env,traceUser:false});}});
