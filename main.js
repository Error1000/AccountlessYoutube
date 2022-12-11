class Video {
    constructor(channel, href, thumbnailImageURL, title, durationSecs, views, ageString) {
        this.channel = channel;
        this.href = href;
        this.thumbnailImageURL = thumbnailImageURL;
        this.title = title;
        this.durationSecs = durationSecs;
        this.views = views;
        this.ageString = ageString;
    }
}

var subscriptions = ['jacksepticeye'];
var feedVideos = [];
var lastUpdated = new Date(0);

console.log("Accountless-youtube content script loaded!");

function localStorageExists() {
    try {
        // Try to access local storage, even if the key doesn't exist, it wont't throw an error
        // So we can use try .. catch to detect if browser.storage.local is initialised
        browser.storage.local.get("this string can be anything");
        return true;
    } catch (e) {
        return false;
    }
}

// NOTE: This function will initialize the values to defaults if it couldn't read them and will report success
async function readStorageData() {
    if (!localStorageExists()) return false;
    feedVideos = (await browser.storage.local.get("cachedVideos"))["cachedVideos"];
    if (feedVideos === undefined || feedVideos === null) {
        feedVideos = [];
    }

    lastUpdated = (await browser.storage.local.get("lastUpdated"))["lastUpdated"];
    if (lastUpdated === undefined || lastUpdated === null) {
        lastUpdated = new Date(0);
    } else {
        lastUpdated = Date.parse(lastUpdated);
    }

    return true;
}

async function writeStorageData() {
    if (!localStorageExists()) return false;
    await browser.storage.local.set({ "lastUpdated": lastUpdated.toJSON() });
    await browser.storage.local.set({ "cachedVideos": feedVideos });
    return true;
}

window.addEventListener("pageshow", async () => {
    await ensure(readStorageData);
    console.log("Using last updated date: ", lastUpdated);
    if ((new Date() - lastUpdated) / 1000 / 60 > 10) { // If more than 10 minutes since last update
        console.log("Updating feed!");
        feedVideos = [];
        for (var subscription of subscriptions) {
            var channelUrl = "https://www.youtube.com/@" + subscription + "/videos";
            let request = new XMLHttpRequest();
            request.onreadystatechange = function () {
                if (this.readyState == 4 && this.status == 200) {
                    var parser = new DOMParser();
                    var documentToScrape = parser.parseFromString(request.responseText, "text/html");
                    // Extract variable from scripts
                    var jsonSring = Array.from(documentToScrape.getElementsByTagName("script"))
                        .map(script => script.innerText.match(/ytInitialData *= *([^;]*);/)).filter(res => res !== null)[0][1]; /* select first regex match result, then select the second match of that regex match result to get the result of the capture group */
                    var data = JSON.parse(jsonSring)["contents"]["twoColumnBrowseResultsRenderer"]["tabs"]
                        .find(tab => tab["tabRenderer"]["selected"])["tabRenderer"]["content"]["richGridRenderer"]["contents"];
                    for (var video of data) {
                        var video = video["richItemRenderer"]["content"]["videoRenderer"];
                        var thumbnailUrl = video["thumbnail"]["thumbnails"].slice(-1)[0]["url"];
                        var id = video["navigationEndpoint"]["watchEndpoint"]["videoId"];
                        var title = video["title"]["runs"].map(run => run["text"]).join();
                        var duration = fromHHMMSS(video["lengthText"]["simpleText"]);
                        var views = parseInt(video["viewCountText"]["simpleText"].replace(/\D/g, ''));
                        var age = video["publishedTimeText"]["simpleText"];
                        feedVideos.push(new Video(subscription, "/watch?v=" + id, thumbnailUrl, title, duration, views, age));
                    }

                }
            }

            request.open("GET", channelUrl, false/* NOT async */);
            request.send();
        }
        lastUpdated = new Date();
        await ensure(writeStorageData);
    }

    await ensure(hijackFeed);
}, false);



// Used to format video data to show

function toHHMMSS(secs) {
    var hours = Math.floor(secs / (60 * 60));
    var minutes = Math.floor(secs / 60) % 60;
    var seconds = secs % 60;

    return [hours, minutes, seconds]
        .map(value => value < 10 ? ("0" + value) : ("" + value))
        .filter((value, index) => value !== "00" || index === 1 || index == 2) // Remove 0's, but keep minutes and seconds
        .join(":");
}

function fromHHMMSS(string) {
    var vals = string.split(":").map(val => parseInt(val)).map(val => { if (val === null) return 0; else return val; });
    var amount = 0;
    var ind = 0;
    for (var formatElement of vals.reverse()) {
        amount += Math.pow(60, ind) * formatElement;
        ind++;
    }
    return amount;
}

function formatViews(views) {
    if (views < 1e3) {
        return views.toString();
    } else if (views < 1e6) {
        return (Math.floor(views / 1e2) / 10).toString() + "K";
    } else if (views < 1e9) {
        return (Math.floor(views / 1e5) / 10).toString() + "M";
    } else if (views < 1e12) {
        return (Math.floor(views / 1e8) / 10).toString() + "B";
    } else {
        // Give up, i guess?
        return views.toString();
    }
}



/////////////////////////////////////////////////////////////////////



const feedCSSToInject = `
<style>
    div.injected-yt-feed {
        margin-top: 10px;
        margin-left: 10px;
        width: 100%;
        height: 100%;
    }

    div.injected-yt-video {
        float: left;
        width: 250px;
        aspect-ratio: 1.1;
        margin-left: 8px;
        margin-right: 8px;
        margin-bottom: 6px;
    }

    div.injected-yt-video > a {
        max-width: 100%;
        max-height: 100%;
        color: white;
        text-decoration: none;
    }

    div.injected-yt-thumbnail {
        position: relative;
    }

    div.injected-yt-thumbnail > img {
        max-width: 100%;
        max-height: 100%;
        margin-bottom: 6px;
        border-radius: 10px;
        object-fit: contain;
    }

    div.injected-yt-thumbnail-duration {
        position: absolute;
        
        bottom: 10px;
        right: 5px;
        
        padding-left: 3px;
        padding-right: 3px;
        
        border-radius: 4px;
        background-color: rgba(0, 0, 0, 0.8);
        
        font-family: sans-serif;
        font-size: small;
        font-weight: 400;

        z-index: 10;
    }

    a.injected-yt-title {
        font-family: sans-serif;
        font-size: 14px;
        font-weight: 500;
        text-decoration: none;
        color: white;
    }

    div.injected-yt-title {
        margin-bottom: 3px;
    }

    a.injected-yt-channel {
        font-family: sans-serif;
        font-size: 12px;
        color: lightgray;
        text-decoration: none;
    }

    div.injected-yt-stats {
        font-family: sans-serif;
        color: lightgray;
        font-size: 12px;
    }

    div.injected-yt-metadata > img {
        border-radius: 50%;
        width: 35px;
        height: 35px;
        margin-right: 10px;
        margin-bottom: 100%;
        float: left;
    }
</style>
`;

function injectVideo(feed, videoHref, channelHref, thumbnailImageSrc, durationText, title, channel, stats) {
    var injectedYtVideo = document.createElement("div");
    injectedYtVideo.classList.add("injected-yt-video");
    feed.appendChild(injectedYtVideo);

    var anchor = document.createElement("a");
    injectedYtVideo.appendChild(anchor);
    anchor.href = videoHref;

    var injectedYtThumbnail = document.createElement("div");
    injectedYtThumbnail.classList.add("injected-yt-thumbnail");
    anchor.appendChild(injectedYtThumbnail);

    var thumbnailImage = document.createElement("img");
    injectedYtThumbnail.appendChild(thumbnailImage);
    thumbnailImage.src = thumbnailImageSrc;

    var injectedYtThumbnailDuration = document.createElement("div");
    injectedYtThumbnailDuration.classList.add("injected-yt-thumbnail-duration");
    injectedYtThumbnail.appendChild(injectedYtThumbnailDuration);
    injectedYtThumbnailDuration.innerText = durationText;

    var injectedYtMetadata = document.createElement("div");
    injectedYtMetadata.classList.add("injected-yt-metadata");
    injectedYtVideo.appendChild(injectedYtMetadata);

    // channel image would go here along with wrapper

    var titleWrapper = document.createElement("div");
    titleWrapper.classList.add("injected-yt-title");
    injectedYtMetadata.appendChild(titleWrapper);

    var injectedYtTitle = document.createElement("a");
    injectedYtTitle.classList.add("injected-yt-title");
    titleWrapper.appendChild(injectedYtTitle);
    injectedYtTitle.innerText = title;
    injectedYtTitle.href = videoHref;

    var channelWrapper = document.createElement("div");
    channelWrapper.classList.add("injected-yt-channel");
    injectedYtMetadata.appendChild(channelWrapper);
    var injectedYtChannel = document.createElement("a");
    injectedYtChannel.classList.add("injected-yt-channel");
    channelWrapper.appendChild(injectedYtChannel);
    injectedYtChannel.innerText = channel;
    injectedYtChannel.href = channelHref;

    var injectedYtStats = document.createElement("div");
    injectedYtStats.classList.add("injected-yt-stats");
    injectedYtMetadata.appendChild(injectedYtStats);
    injectedYtStats.innerText = stats;
}


function hijackFeed() {
    var content = document.querySelector("ytd-browse[page-subtype=\"subscriptions\"]:not([hidden])");
    if (content !== null) {
        if (content.attributes["page-subtype"].nodeValue === "subscriptions") {
            content.innerHTML = "";
            content.innerHTML += feedCSSToInject;


            var injected_feed = document.createElement("div");
            injected_feed.classList.add("injected-yt-feed");
            content.appendChild(injected_feed);
            for (const video of feedVideos) {
                injectVideo(injected_feed, video.href, "/@" + video.channel, video.thumbnailImageURL, toHHMMSS(video.durationSecs), video.title, video.channel, formatViews(video.views) + " views • " + video.ageString);
            }

            return true;
        }
    }
    return false;
}

function hijackSubscribeButton() {
    var theButton = document.querySelector("yt-button-shape.ytd-subscribe-button-renderer");
    if (theButton !== null) {
        console.log(theButton);
        return true;
    }
    return false;
}




function sleep(amountInMs) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, amountInMs);
    });
}

async function waitForDomChange() {
    return new Promise((resolve) => {
        const observer = new MutationObserver(() => {
            resolve();
        });

        observer.observe(document.body, {
            attributes: true,
            childList: true,
            subtree: true
        });
    });
}

// Keeps executing f, until it returns true, calling waitingFunction to avoid a tight loop
// Returns immediately, letting f run in the background asynchronously
// If you want to wait for f to succeed you can simply await ensure
async function ensure(f, waitingFunction = () => { return sleep(100); }) {
    while ((await f()) === false) {
        await waitingFunction();
    }
}



// TODO: Make sure using waitForDomChange is actually better
ensure(readStorageData).then(ensure(hijackFeed, waitForDomChange));
