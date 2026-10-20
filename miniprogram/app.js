const {env}=require('./cloud-config');
App({onLaunch(){if(env && wx.cloud)wx.cloud.init({env,traceUser:false});}});
