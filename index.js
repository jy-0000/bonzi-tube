var express = require("express");
var app = express();
var http = require("http").createServer(app);
var io = require("socket.io")(http);
let cors = require('cors');
var fs = require("fs");
var path = require('path');
let bans = require('./bans');
var config = JSON.parse(fs.readFileSync("./config.json",{encoding:'utf-8'}));
let catalogue = require('./catalogue');
let whitelist = ["https://files.catbox.moe","./img/"];
let thumbnailforms = [".png",".jpg",".jpeg"];
app.use(cors());
app.use(express.static("public"));
http.listen(config.port, () => { console.log(`Bonzitube is listening at localhost:${http.address().port}`); });

var blacklist = [
    "<script>",
    "<a href='javascript:",
    '<a href="javascript:',
    "<a",
    "/>",
    "<video>",
    "<img>",
    "<img>",
    "<audio>",
    " onclick='",
    ' onclick="',
    " onmouseover='",
    'onmouseover="',
    "();",
    "function()",
    "function ()",
    "() =>",
    '.innerHTML = "',
    ".innerHTML = ",
];
let msgs = [];
var adminPass = "biabwiclvb696969!@";
var Utils = {
    sanitizeString:(str)=>{
        if(typeof str !== "string")str = '';
        str = str.replaceAll('"','\\"');
        str = str.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '');
        try {
            str = decodeURIComponent(JSON.parse('"'+str+'"'));
        } catch(e) {
            str = str.replaceAll('\\"','"');
        }
        for(let i=0;i<blacklist.length;i++){
            let satan = blacklist[i];
            if(str.includes(satan))str = str.replaceAll(satan,"");
        }
        return str
    },
    newId:(len)=>{
        let result = "";
        for(let i=0;i<len;i++){
            result+="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ".charAt(Math.floor(Math.random() * 36));
        }
        return result;
    },
    getJSON:(file)=>{
        let newJSON = undefined;
        try {
            let e = fs.readFileSync(file,{encoding:'utf-8'});
            newJSON = JSON.parse(e);
        } catch(e){
            newJSON = undefined;
        }
        return newJSON;
    },
    averageSet:(array)=>{
        let result = 0;
        let tick = 0;
        array.forEach(value=>{result+=value;tick++;});
        result = result/tick;
        return result;
    },
	stringErr: (str1, str2)=>{
    str1 = String(str1 || '');
    str2 = String(str2 || '');
    
    if (str1 === str2) {
        return {
            difference: 0,
            similarity: 1,
            match: true
        };
    }
    var matrix = [];
    var len1 = str1.length;
    var len2 = str2.length;
    for (var i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }
    for (var j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }
    
    
    for (var i = 1; i <= len1; i++) {
        for (var j = 1; j <= len2; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,    
                    matrix[i][j - 1] + 1,    
                    matrix[i - 1][j - 1] + 1 
                );
            }
        }
    }
    
    var distance = matrix[len1][len2];
    var maxLength = Math.max(len1, len2);
    var similarity = maxLength === 0 ? 1 : (maxLength - distance) / maxLength;
    
    return similarity;
}

};
let mostViewed = [];
let globalChat = ``;
let maxDate = 0;
let userAvatars = {};

function getComments(videoId){
    let allComments = Utils.getJSON('./comments.json') || {};
    return allComments[videoId] || [];
}

function saveComment(videoId, comment){
    let allComments = Utils.getJSON('./comments.json') || {};
    if(!allComments[videoId]){
        allComments[videoId] = [];
    }
    allComments[videoId].push(comment);
    fs.writeFileSync('./comments.json', JSON.stringify(allComments), 'utf-8');
}

function deleteComment(videoId, commentId){
    let allComments = Utils.getJSON('./comments.json') || {};
    if(!allComments[videoId])return false;
    
    let filteredComments = allComments[videoId].filter(comment => comment.id !== commentId);
    
    if(filteredComments.length === allComments[videoId].length)return false;
    
    allComments[videoId] = filteredComments;
    fs.writeFileSync('./comments.json', JSON.stringify(allComments), 'utf-8');
    return true;
}

function likeComment(videoId, commentId, ip, type){
    let allComments = Utils.getJSON('./comments.json') || {};
    if(!allComments[videoId])return false;
    
    let commentIndex = allComments[videoId].findIndex(c => c.id === commentId);
    if(commentIndex === -1)return false;
    
    let comment = allComments[videoId][commentIndex];
    
    if(!comment.likes)comment.likes = [];
    if(!comment.dislikes)comment.dislikes = [];
    
    let likeIndex = comment.likes.indexOf(ip);
    let dislikeIndex = comment.dislikes.indexOf(ip);
    
    if(type === "like"){
        if(likeIndex !== -1){
            comment.likes.splice(likeIndex, 1);
        } else {
            if(dislikeIndex !== -1){
                comment.dislikes.splice(dislikeIndex, 1);
            }
            comment.likes.push(ip);
        }
    } else if(type === "dislike"){
        if(dislikeIndex !== -1){
            comment.dislikes.splice(dislikeIndex, 1);
        } else {
            if(likeIndex !== -1){
                comment.likes.splice(likeIndex, 1);
            }
            comment.dislikes.push(ip);
        }
    }
    
    allComments[videoId][commentIndex] = comment;
    fs.writeFileSync('./comments.json', JSON.stringify(allComments), 'utf-8');
    return true;
}

function getRating(videoId){
    let ratingsFile = Utils.getJSON('./user_cont/ratings/$'+videoId.replace('#','')+'.json');
    if(!ratingsFile)return 0;
    let ratings = Object.values(ratingsFile);
    if(ratings.length === 0)return 0;
    return Utils.averageSet(ratings);
}

function compileMostViewed(){
    let result = [];
    fs.readdir(__dirname+'/user_cont/videos', (err, files) => {
        if(err){
            console.error('Failed to get videos: ', err);
            return;
        }
        let archive = Utils.getJSON('archive.json');
        files.forEach(file => {
            let videoCont = Utils.getJSON("./user_cont/videos/"+file);
            let thisRating = getRating(videoCont["id"]);
            videoCont["stars"] = thisRating || 0;
            if(videoCont["creator"] !== undefined)delete videoCont["creator"];
            if(videoCont["timestamp"] == undefined)videoCont["timestamp"]="Unknown";
            result = [...result,videoCont];
        });
        result.sort((a,b) => b.views-a.views);
        mostViewed = result;
        let e = mostViewed.toSorted((a,b)=>b.date-a.date);
        maxDate = e[0]["date"];
    });
}

function updateVideo(videoName,videoObject){
    fs.readdir(__dirname+'/user_cont/videos',(err,files)=>{
        if(err)console.error(err);
        for(let i=0;i<files.length;i++){
            let fileName = files[i];
            if(fileName == videoName+".json"){
                fs.writeFileSync('./user_cont/videos/'+videoName+'.json',JSON.stringify(videoObject),'utf-8');
            }
        }
    });
}

function updateCatalogue(ip){
    catalogue.ips[ip] = catalogue.ips[ip] == undefined ? [] : catalogue.ips[ip];
    fs.writeFileSync('./catalogue.js',`module.exports = {titles:${JSON.stringify(catalogue.titles)},ips:${JSON.stringify(catalogue.ips)}}`,'utf-8');
}

function updateArchive(newArchive){
    if(newArchive == undefined){
    let archive = Utils.getJSON("./archive.json");
    fs.readdir(__dirname+'/user_cont/videos',(err,files)=>{
        archive.forEach(video => {
            if(!files.includes(video["id"]+'.json')){
            fs.writeFile('./user_cont/videos/'+video["id"]+'.json', `
            {
            "title":"${video.title}",
            "views":${video.views},
            "author":"${video.author}",
            "id":"${video.id}",
            "type":"mp4",
            "src":"${video.src}",
            "date":${video.date},
			"stars":${video.stars || 0},
            "thumbnail":"${video.thumbnail}",
            "creator":"Unknown",
            "timestamp":"${video.timestamp}"
            }
            `, (err) => {
            if (err) {
                console.error('Error creating file:', err);
            } else {
                console.log('File created successfully!');
            }
            });
            } else {
                let videoPath = "./user_cont/videos/"+video["id"]+".json"
                let newVideo = Utils.getJSON(videoPath);
                newVideo["views"] = video["views"];
                fs.writeFileSync(videoPath,JSON.stringify(newVideo),'utf-8');
            }
        });
    });
    }
    else {
        fs.writeFileSync('archive.json',JSON.stringify(newArchive),'utf-8');
    }
}

function loadUserAvatars(){
    let avatars = Utils.getJSON('./avatars.json');
    if(avatars){
        userAvatars = avatars;
    }
}

function saveUserAvatars(){
    fs.writeFileSync('./avatars.json', JSON.stringify(userAvatars), 'utf-8');
}

function loadChatMessages(){
    let messages = Utils.getJSON('./chatmessages.json');
    if(messages){
        msgs = messages;
    }
}

function saveChatMessages(){
    fs.writeFileSync('./chatmessages.json', JSON.stringify(msgs), 'utf-8');
}

app.get('/video', async (req, res) => {
    try {
        let acceptHeader = req.get('Accept') || '';
        let userAgent = req.get('User-Agent') || '';
        
        let isDiscord = userAgent.includes('Discordbot');
        
        if (acceptHeader.includes('text/html') || isDiscord) {
            if (req.query.id) {
                if (isDiscord) {
                    fs.readdir(__dirname + '/user_cont/videos', (err, files) => {
                        if (err) {
                            return res.redirect('./?video=' + req.query.id);
                        }
                        
                        if (files.includes('#' + req.query.id + '.json')) {
                            let thisVideo = Utils.getJSON('./user_cont/videos/#' + req.query.id + '.json');
                            if (thisVideo == undefined) {
                                return res.redirect('./?video=' + req.query.id);
                            }
                            let embedHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta property="og:title" content="BonziTUBE">
    <meta property="og:description" content="Shared video: ${thisVideo.title || 'Video'} - by ${thisVideo.author}">
    <meta property="og:type" content="video.other">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="BonziTUBE">
    <meta name="twitter:description" content="Shared video: ${thisVideo.title || 'Video'} - by ${thisVideo.author}">
        <meta property="og:image" content="${thisVideo.thumbnail || 'https://bonzi-tube.onrender.com/img/logo.png'}" />
    <title>BonziTUBE</title>
</head>
<body>
    <script>
        window.location.href = './?video=${req.query.id}';
    </script>
</body>
</html>`;
                            
                            return res.send(embedHTML);
                        } else {
                            return res.redirect('./?video=' + req.query.id);
                        }
                    });
                } else {
                    return res.redirect('./?video=' + req.query.id);
                }
            } else {
                return res.status(400).send('No video ID provided');
            }
            return;
        }
        if (req.query.id) {
            fs.readdir(__dirname + '/user_cont/videos', (err, files) => {
                if (err) {
                    return res.status(500).json({error: 'Server error'});
                }
                
                if (files.includes('#' + req.query.id + '.json')) {
                    let thisVideo = Utils.getJSON('./user_cont/videos/#' + req.query.id + '.json');
                    if (thisVideo && thisVideo["creator"] !== undefined) {
                        delete thisVideo["creator"];
                    }
					thisVideo["stars"] = getRating(thisVideo["id"]);
                    return res.json(thisVideo);
                } else {
                    return res.status(404).json({error: 'Video not found'});
                }
            });
        } else {
            return res.status(400).json({error: 'No video ID provided'});
        }
    } catch (e) {
        console.error('Error in /video route:', e);
        return res.status(500).json({error: 'Internal server error'});
    }
});

let uses = {};
let warnings = {};
let commentUses = {};
let commentWarnings = {};
let chatUses = {};
let chatWarnings = {};

function modifyUses(ip,amt){
    if(uses[ip]==undefined)uses[ip]=0;
    uses[ip]+=amt;
}

function modifyWarnings(ip,amt){
    if(warnings[ip]==undefined)warnings[ip]=0;
    warnings[ip]+=amt;
}

function modifyCommentUses(ip,amt){
    if(commentUses[ip]==undefined)commentUses[ip]=0;
    commentUses[ip]+=amt;
}

function modifyCommentWarnings(ip,amt){
    if(commentWarnings[ip]==undefined)commentWarnings[ip]=0;
    commentWarnings[ip]+=amt;
}

function modifyChatUses(ip,amt){
    if(chatUses[ip]==undefined)chatUses[ip]=0;
    chatUses[ip]+=amt;
}

function modifyChatWarnings(ip,amt){
    if(chatWarnings[ip]==undefined)chatWarnings[ip]=0;
    chatWarnings[ip]+=amt;
}

function inNeighborhood(ip1, ip2, subnetMask) {
  var parseIp = (ipString) => ipString.split('.').map(Number);
  var parseSubnetMask = (maskString) => maskString.split('.').map(Number);

  var ip1Octets = parseIp(ip1);
  var ip2Octets = parseIp(ip2);
  var maskOctets = parseSubnetMask(subnetMask);

  var networkAddress1 = ip1Octets.map((octet, i) => octet & maskOctets[i]);
  var networkAddress2 = ip2Octets.map((octet, i) => octet & maskOctets[i]);

  return networkAddress1.every((val, i) => val === networkAddress2[i]);
}

function currentDate(){
    let d = new Date();
    return d.toDateString();
}
let topTrending = [];
function getTrending(){
    let result = [];
    fs.readdir(__dirname+'/user_cont/videos', (err, files) => {
        if(err){
            console.error('Failed to get videos: ', err);
            return;
        }
        files.forEach(file => {
            let videoCont = Utils.getJSON("./user_cont/videos/"+file);
            let thisRating = getRating(videoCont["id"]);
            videoCont["stars"] = thisRating || 0;
            if(videoCont["creator"] !== undefined)delete videoCont["creator"];
            if(videoCont["timestamp"] == undefined)videoCont["timestamp"]="Unknown";
            result = [...result,videoCont];
        });
        result.sort((a,b) => b.date-a.date);
        let newest15 = result.slice(0,15);
        newest15.sort((a,b) => b.views-a.views);
        topTrending = newest15.slice(0,7);
    });
}

compileMostViewed();
updateArchive();
loadUserAvatars();
loadChatMessages();
console.log(getTrending());
setInterval(() => {compileMostViewed(); getTrending();},10000);
setInterval(() => {saveChatMessages();},15000);
let viewCount = 0;
setTimeout(() => {
mostViewed.forEach(vid => {viewCount+=vid["views"];});
console.log("GLOBAL VIEW COUNT "+viewCount);
},3000);

io.on("connection",socket => {
    socket.ip = socket.request.headers['x-forwarded-for'] == undefined ? "127.0.0.1" : socket.request.headers['x-forwarded-for'];
    if(socket.ip.includes(","))socket.ip = socket.ip.split(",")[0];
    updateCatalogue(socket.ip);
    console.log(socket.ip);
    console.log(bans.some(r => inNeighborhood(socket.ip,r,"255.255.255.0")) + " ("+socket.ip+")")
    if(bans.includes(socket.ip) || bans.some(r => inNeighborhood(socket.ip,r,"255.255.255.0"))){
        socket.emit("err","You are banned from BonziTUBE!");
        socket.disconnect(true);
        return;
    }

    socket.emit("chatHistory", msgs);
    socket.on("getTrending",data=>{
		socket.emit("trendingPage",topTrending);
	});
    socket.on("chatMessage",data=>{
        modifyChatUses(socket.ip,1);
        setTimeout(() => {modifyChatUses(socket.ip,-1);},3000);
        
        if(chatUses[socket.ip] > 5){
            modifyChatWarnings(socket.ip,1);
            setTimeout(() => {modifyChatWarnings(socket.ip,-1);},30000);
            if(chatWarnings[socket.ip] > 3){
                socket.disconnect(true);
                return;
            }
            socket.emit("err","You are sending messages too fast. Please slow down.");
            return;
        }
        
        if(typeof data !== "object")return;
        if(typeof data.username !== "string")return;
        if(typeof data.message !== "string")return;
        
        let imageUrl = "";
        if(data.image && typeof data.image === "string"){
            let sanitizedImage = Utils.sanitizeString(data.image).trim();
            if(whitelist.some(r => sanitizedImage.startsWith(r)) && thumbnailforms.some(r => sanitizedImage.endsWith(r))){
                imageUrl = sanitizedImage;
            }
        }
        
        let sanitizedMessage = {
            username: Utils.sanitizeString(data.username).substring(0,28) || "Anonymous",
            message: Utils.sanitizeString(data.message).substring(0,500),
            image: imageUrl,
            timestamp: Date.now(),
            id: Utils.newId(8),
            avatar: userAvatars[socket.ip] || ""
        };
        
        msgs.push(sanitizedMessage);
        if(msgs.length > 100){
            msgs.shift();
        }
        
        io.emit("chatMessage", sanitizedMessage);
    });

    socket.on("getVideoForEmbed",data=>{
        if(typeof data !== "object")return;
        if(typeof data.videoId !== "string")return;
        
        fs.readdir(__dirname + '/user_cont/videos', (err, files) => {
            if(err)return;
            
            if(files.includes('#' + data.videoId + '.json')){
                let thisVideo = Utils.getJSON('./user_cont/videos/#' + data.videoId + '.json');
                if(thisVideo){
                    if(thisVideo["creator"])delete thisVideo["creator"];
                    socket.emit("videoEmbed",{videoId:data.videoId, video:thisVideo});
                }
            }
        });
    });
	socket.on("searchQuery",data=>{
		if(typeof data !== "object")return;
		if(typeof data.query !== "string")return;
		let result = [];
		let sanitizedQuery = Utils.sanitizeString(data.query).toLowerCase();
	
		mostViewed.forEach(video => {
			let similarity = Utils.stringErr(sanitizedQuery, video.title.toLowerCase());
			result.push({
				video: video,
				similarity: similarity
			});
		});
	
		result.sort((a,b) => b.similarity - a.similarity);
		result = result.slice(0, 20).map(item => item.video);
		console.log(result);
		socket.emit("searchResult",result);
	});
    socket.on("setAvatar",data=>{
        if(typeof data !== "object")return;
        if(typeof data.avatarUrl !== "string")return;
        
        let sanitizedAvatar = Utils.sanitizeString(data.avatarUrl).trim();
        
        if(sanitizedAvatar === ""){
            userAvatars[socket.ip] = "";
            saveUserAvatars();
            socket.emit("avatarSet",{success:true, avatar:""});
            return;
        }
        
        if(!whitelist.some(r => sanitizedAvatar.startsWith(r)) || !thumbnailforms.some(r => sanitizedAvatar.endsWith(r))){
            socket.emit("err","Please use a valid catbox.moe image URL for your avatar.");
            return;
        }
        
        userAvatars[socket.ip] = sanitizedAvatar;
        saveUserAvatars();
        socket.emit("avatarSet",{success:true, avatar:sanitizedAvatar});
    });

    socket.on("getAvatar",data=>{
        socket.emit("currentAvatar",{avatar:userAvatars[socket.ip] || ""});
    });
    
    socket.on("getComments",data=>{
        if(typeof data !== "object")return;
        if(typeof data.videoId !== "string")return;
        let comments = getComments(data.videoId);
        socket.emit("comments",{videoId:data.videoId, comments:comments});
    });
    
    socket.on("postComment",data=>{
        modifyCommentUses(socket.ip,1);
        setTimeout(() => {modifyCommentUses(socket.ip,-1);},10000);
        
        if(commentUses[socket.ip] > 5){
            modifyCommentWarnings(socket.ip,1);
            setTimeout(() => {modifyCommentWarnings(socket.ip,-1);},30000);
            if(commentWarnings[socket.ip] > 3){
                socket.disconnect(true);
                return;
            }
            socket.emit("err","You are commenting too fast. Please slow down.");
            return;
        }
        
        if(typeof data !== "object")return;
        if(typeof data.videoId !== "string")return;
        if(typeof data.author !== "string")return;
        if(typeof data.text !== "string")return;
        
        let sanitizedComment = {
            author: Utils.sanitizeString(data.author).substring(0,28) || "Anonymous",
            text: Utils.sanitizeString(data.text).substring(0,500),
            timestamp: currentDate(),
            id: Utils.newId(8),
            likes: [],
            dislikes: []
        };
        
        saveComment(data.videoId, sanitizedComment);
        socket.emit("commentPosted",{success:true});
        
        let comments = getComments(data.videoId);
        io.emit("comments",{videoId:data.videoId, comments:comments});
    });
    
    socket.on("deleteComment",data=>{
        if(typeof data !== "object")return;
        if(typeof data.videoId !== "string")return;
        if(typeof data.commentId !== "string")return;
        if(typeof data.password !== "string")return;
        
        if(data.password !== adminPass){
            socket.emit("err","Invalid admin password");
            return;
        }
        
        let success = deleteComment(data.videoId, data.commentId);
        
        if(success){
            let comments = getComments(data.videoId);
            io.emit("comments",{videoId:data.videoId, comments:comments});
            socket.emit("alert","Comment deleted successfully");
        } else {
            socket.emit("err","Comment not found");
        }
    });
    
    socket.on("likeComment",data=>{
        if(typeof data !== "object")return;
        if(typeof data.videoId !== "string")return;
        if(typeof data.commentId !== "string")return;
        if(typeof data.type !== "string")return;
        if(data.type !== "like" && data.type !== "dislike")return;
        
        let success = likeComment(data.videoId, data.commentId, socket.ip, data.type);
        
        if(success){
            let comments = getComments(data.videoId);
            io.emit("comments",{videoId:data.videoId, comments:comments});
        }
    });
    
    socket.on("rate",data=>{
        if(typeof data !== "object")return;
        if(typeof data.id !== "string")return;
        if(typeof data.rating !== "number")return;
        if(data.rating > 5 || data.rating < 1)return;
        
        let video = Utils.getJSON('./user_cont/videos/'+data.id+'.json');
        if(video == undefined)return;
        
        let filename = '$'+data.id.replace('#','')+'.json';
        let filepath = './user_cont/ratings/'+filename;
        
        let currentRatings = Utils.getJSON(filepath) || {};
        currentRatings[socket.ip] = Math.floor(data.rating);
        
        fs.writeFileSync(filepath, JSON.stringify(currentRatings), 'utf-8');
        
        let averageRating = getRating(data.id);
        socket.emit("ratingUpdated",{videoId:data.id, rating:averageRating});
    });
    
    socket.on("home",data=>{
        if(data !== undefined && typeof data == "object"){
            let e = mostViewed.toSorted((a,b)=>b.date-a.date);
            socket.emit("home",{most:mostViewed,new:e});
        }
    });
    
    socket.on("getIp",data=>{
        if(typeof data !== "object")return;
        if(data.id == undefined)return;
        if(data.password == undefined)return;
        if(typeof data.id !== "string")return;
        if(typeof data.password !== "string")return;

        let videoContent = Utils.getJSON('./user_cont/videos/'+data.id+'.json');
        console.log(videoContent)
        if(videoContent == undefined)return;
        if(videoContent["creator"] == undefined)return;
        
        if(data.password == adminPass){
            socket.emit("getIp",videoContent["creator"]);
        }
    });
    
    socket.on("banUsar",data=>{
        if(typeof data !== "object")return;
        if(data.id == undefined)return;
        if(data.password == undefined)return;
        if(typeof data.id !== "string")return;
        if(typeof data.password !== "string")return;
        if(data.password !== adminPass)return;
         
            bans = [...bans,data.ip]; 
            fs.writeFileSync('./bans.js',JSON.stringify(bans),'utf-8');
            console.log("Ban success!")
    });
    socket.on("deleteMessage",data=>{
    if(typeof data !== "object")return;
    if(typeof data.messageId !== "string")return;
    if(typeof data.password !== "string")return;
    
    if(data.password !== adminPass){
        socket.emit("err","Invalid admin password");
        return;
    }
    
    let messageIndex = msgs.findIndex(m => m.id === data.messageId);
    
    if(messageIndex === -1){
        socket.emit("err","Message not found");
        return;
    }
    
    msgs.splice(messageIndex, 1);
    saveChatMessages();
    
    io.emit("chatHistory", msgs);
    socket.emit("alert","Message deleted successfully");
});
    socket.on("delete",data=>{
        if(typeof data !== "object")return;
        if(data.id == undefined)return;
        if(data.password == undefined)return;
        if(typeof data.id !== "string")return;
        if(typeof data.password !== "string")return;

        if(data.password == adminPass){
            fs.unlink('./user_cont/videos/'+data.id+'.json', (err) => {
                if (err) {
                    console.error('Error deleting file:', err);
                return;
                }
            console.log('File deleted successfully!');
            });
            socket.emit("alert","Video deleted successfully. It may take time to disappear");
            let e = mostViewed.toSorted((a,b)=>b.date-a.date);
            socket.emit("home",{most:mostViewed,new:e});
        }
    });
    
    socket.on("goto",data=>{
        if(data !== undefined && typeof data == "string"){
            let result = {};
            data = Utils.sanitizeString(data);
            if(!data.startsWith("#"))return;
            fs.readdir(__dirname+'/user_cont/videos',(err,files)=>{
                if(err){
                    console.error('Failed to get video: ',err);
                    return;
                }
                for(let i=0;i<files.length;i++){
                    let fileName = files[i];
                    if(fileName == data+".json"){
                        result = Utils.getJSON("./user_cont/videos/"+fileName);
                        if(catalogue.ips[socket.ip].includes(result["id"])){

                        } else {
                            result["views"]++;
                            catalogue.ips[socket.ip] = [...catalogue.ips[socket.ip], result["id"]];
                            updateVideo(result["id"],result);
                            updateCatalogue(socket.ip);
                            compileMostViewed();
                        }
                    }
                }
            });
        }
    });
    
    socket.on("ratings",data=>{
        if(typeof data !== "object")return;
        if(typeof data.id !== "string")return;
        if(typeof data.value !== "number" || data.value > 5)return;
        if(typeof data.type !== "string")return;
        if(!data.id.startsWith("#"))return;

        let video = Utils.getJSON('./user_cont/videos/'+data.id+".json");

        if(video == undefined)return;
        fs.readdir(__dirname+'./user_cont/ratings/',(files,err)=>{
            let filename = '$'+data.id+'.json';
            if(files.includes(filename)){
                let currentRating = Utils.getJSON('./user_cont/ratings/'+filename);
                if(Object.keys(currentRating).includes(socket.ip) && currentRating[socket.ip] === data.value){}
                else {
                currentRating[socket.ip] = Math.floor(data.value);
                fs.writeFile('./user_cont/ratings/'+filename,JSON.stringify(currentRating),(err)=>{
                    
                });}
            }
        });
    });
    
    socket.on("upload",data=>{
        modifyUses(socket.ip,1);
        setTimeout(() => {modifyUses(socket.ip,-1);},config.rateLimit*uses[socket.ip]);
        if(uses[socket.ip] > 3){
            modifyWarnings(socket.ip,1);
            setTimeout(() => {modifyWarnings(socket.ip,-1);},config.rateLimit*warnings[socket.ip]);
            if(warnings[socket.ip] > 3){socket.disconnect(true);}
            socket.emit("err","You have uploaded too much recently. Please wait a while.")
            return;}
        console.log(data)
        if(typeof data !== "object")return;

        let halt = false;
        Object.keys(data).forEach(parame => {
            if(typeof parame !== "string")halt = true;
        });
        
        if(halt){
            console.log("halted");
            socket.emit("err","You used the wrong data types");
            return;
        }
        if(data.author == undefined || data.author == "")data.author = "Anonymous Uploader";
        console.log(data.author == undefined || data.author == "");
        console.log(data.title == undefined || data.title == "");
        
        console.log(data.src == undefined || data.src == "");
        console.log(!whitelist.some(r => data.thumbnail.startsWith(r) && data.src.startsWith(r)));
        
        if(data.title == undefined || data.title == "")data.title = "Untitled Video";
        console.log(data.src == undefined || data.src == "")
        if(data.src == undefined || data.src == ""){
            socket.emit("err","Dont leave the video URL blank!");
            return;
        }
        if(data.thumbnail == undefined || data.thumbnail == "")data.thumbnail = './img/logo.png';
        console.log(!whitelist.some(r => data.thumbnail.startsWith(r) && data.src.startsWith(r)));
        if(!whitelist.some(r => data.thumbnail.startsWith(r) && data.src.startsWith(r))){
            socket.emit("err","Please use a catbox.moe URL.");
            return;
        }
        if(!data.src.endsWith(".mp4") || !thumbnailforms.some(r => data.thumbnail.endsWith(r)))return;
        
        console.log((!data.src.endsWith(".mp4") || !thumbnailforms.some(r => data.thumbnail.endsWith(r))));
        let localId = Utils.newId(10);
        let jeffys = ["jefy","jeffy","j3ffy"];
        if(jeffys.some(r => data.title.toLowerCase().includes(r)))return;
        if(catalogue.titles.includes(data.title)){
            socket.emit("err","There is already a video with this name.");
            return;
        } else {
            catalogue.titles = [...catalogue.titles,data.title];
        }
        data = {
            author:Utils.sanitizeString(data.author).substring(0,28),
            title:Utils.sanitizeString(data.title).substring(0,30),
            src:Utils.sanitizeString(data.src).trim(" "),
            thumbnail:Utils.sanitizeString(data.thumbnail).trim(" ")
        }
        console.log("/// DER LOG: "+data.author+", "+data.title+" //// "+socket.ip);
        maxDate++;
        console.log("-- "+maxDate+" --");
        fs.writeFile('./user_cont/videos/#'+localId+'.json', `
            {
            "title":"${data.title}",
            "views":0,
            "author":"${data.author}",
            "id":"#${localId}",
            "type":"mp4",
            "src":"${data.src}",
            "date":${maxDate},
            "thumbnail":"${data.thumbnail}",
            "creator":"${socket.ip}",
            "timestamp":"${currentDate()}"
            }
        `, (err) => {
            if (err) {
                console.error('Error creating file:', err);
            } else {
                console.log('File created successfully!');
            }
        });
        socket.emit("uploadsucceed","true");
        compileMostViewed();
    });
});
