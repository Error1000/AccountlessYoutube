class Video {
    constructor(channel, href, thumbnailImageURL, title, durationSecs, views, ageSecs) {
        this.channel = channel;
        this.href = href;
        this.thumbnailImageURL = thumbnailImageURL;
        this.title = title;
        this.durationSecs = durationSecs;
        this.views = views;
        this.ageSecs = ageSecs;
    }
}

var subscriptions = new Set([]);
var feedVideos = [];
var lastUpdated = new Date(0);

console.log("Accountless-youtube content script loaded!");

// NOTE: Will scrape youtube to get the data
function addSubscriptionVideos(subscription) {
    subscription = subscription.toString().trim();
    console.log("Adding videos of sub: ", subscription);
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
                var age = fromHumanAge(video["publishedTimeText"]["simpleText"]);
                feedVideos.push(new Video(subscription, "/watch?v=" + id, thumbnailUrl, title, duration, views, age));
            }

        }
    }

    request.open("GET", channelUrl, false/* NOT async */);
    request.send();
    // Make sure we keep feed sorted
    feedVideos = feedVideos.sort((a, b) => { if (a.ageSecs < b.ageSecs) { return -1; } else if (a.ageSecs > b.ageSecs) { return 1; } else { return 0; } });
}

function removeSubscriptionVideos(subscription) {
    feedVideos = feedVideos.filter((video) => video.channel !== subscription);
}



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

async function readStorageData() {
    if (!localStorageExists()) return false;
    var subscriptionsRead = (await browser.storage.local.get("subscriptions"))["subscriptions"];
    if (subscriptionsRead !== undefined && subscriptionsRead !== null) {
        subscriptions = new Set(subscriptionsRead);
    }

    var feedVideosRead = (await browser.storage.local.get("cachedVideos"))["cachedVideos"];
    if (feedVideosRead !== undefined && feedVideosRead !== null) {
        feedVideos = feedVideosRead;
    }

    var lastUpdatedRead = (await browser.storage.local.get("lastUpdated"))["lastUpdated"];
    if (lastUpdatedRead !== undefined && lastUpdatedRead !== null) {
        lastUpdated = new Date(Date.parse(lastUpdatedRead));
    }

    return true;
}

async function writeStorageData() {
    if (!localStorageExists()) return false;
    await browser.storage.local.set({ "subscriptions": Array.from(subscriptions) });
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
            addSubscriptionVideos(subscription);
        }
        lastUpdated = new Date();
        await ensure(writeStorageData);
    }
    await ensure(hijackFeed);
}, false);



// Used to format video data to show


// Takes human dates likes: 10 years, or 2.5 minutes
// And returns: that date in seconds
function fromHumanAge(string) {
    const unitMap = {
        "second": 1,
        "seconds": 1,
        "minute": 60,
        "minutes": 60,
        "hour": 60 * 60,
        "hours": 60 * 60,
        "day": 24 * 60 * 60,
        "days": 24 * 60 * 60,
        "week": 7 * 24 * 60 * 60,
        "weeks": 7 * 24 * 60 * 60,
        "month": 30 * 24 * 60 * 60,
        "months": 30 * 24 * 60 * 60,
        "year": 12 * 30 * 24 * 60 * 60,
        "years": 12 * 30 * 24 * 60 * 60,
        "decade": 10 * 12 * 30 * 24 * 60 * 60,
        "decades": 10 * 12 * 30 * 24 * 60 * 60,
    };

    let splits = /(\d*.?\d+) +([^ ]+)/.exec(string).splice(1);
    return parseFloat(splits[0]) * unitMap[splits[1]];
}

function toHumanAge(secs) {
    var decades = Math.round((secs / (10 * 12 * 30 * 24 * 60 * 60)) % (10 * 12 * 30 * 24 * 60 * 60) * 10) / 10;
    if (decades > 1) {
        return decades + " decades";
    } else if (decades == 1) {
        return decades + " decade";
    }

    var years = Math.round(((secs / (12 * 30 * 24 * 60 * 60)) % (12 * 30 * 24 * 60 * 60)) * 10) / 10;
    if (years > 1) {
        return years + " years";
    } else if (years == 1) {
        return years + " year";
    }

    var months = Math.round(((secs / (30 * 24 * 60 * 60)) % (30 * 24 * 60 * 60)) * 10) / 10;
    if (months > 1) {
        return months + " months";
    } else if (months == 1) {
        return months + " month";
    }

    var days = Math.round(((secs / (24 * 60 * 60)) % (24 * 60 * 60)) * 10) / 10;
    if (days > 1) {
        return days + " days";
    } else if (days == 1) {
        return days + " day";
    }

    var hours = Math.round(((secs / (60 * 60)) % (60 * 60)) * 10) / 10;
    if (hours > 1) {
        return hours + " hours";
    } else if (hours == 1) {
        return hours + " hour";
    }

    var minutes = Math.round(((secs / 60) % 60) * 10) / 10;
    if (minutes > 1) {
        return minutes + " minutes";
    } else if (minutes == 1) {
        return minutes + " minute";
    }

    var seconds = Math.round((secs % 60) * 10) / 10;
    if (seconds > 1) {
        return seconds + " seconds";
    } else if (seconds == 1) {
        return seconds + " second";
    } else {
        return seconds + " seconds";
    }
}

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
    }

    div.injected-yt-video {
        float: left;
        width: 250px;
        height: 25.5em;
        overflow: hidden;
        margin-left: 8px;
        margin-right: 8px;
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
                var sinceLastUpdateSecs = (new Date() - lastUpdated) / 1000;
                injectVideo(injected_feed, video.href, "/@" + video.channel, video.thumbnailImageURL, toHHMMSS(video.durationSecs), video.title, video.channel, formatViews(video.views) + " views • " + toHumanAge(video.ageSecs + sinceLastUpdateSecs) + " ago");
            }

            return true;
        }
    }
    return false;
}


function tryGetChannel() {
    var handle = document.querySelector("yt-formatted-string[id=\"channel-handle\"]");
    if (handle !== null) return handle.innerText;
    var videoChannelName = document.querySelector("yt-formatted-string.ytd-channel-name");
    if (videoChannelName !== null) return videoChannelName.getElementsByTagName("a")[0].href.split('/').slice(-1)[0];
    return null;
}

function hijackSubscribeButton() {
    let theBell = document.querySelector("div#notification-preference-button");
    if (theBell !== null) {
        theBell.remove();
        var theButton = document.querySelector("yt-button-shape.ytd-subscribe-button-renderer");
        if (theButton !== null) {
            var theButton = theButton.getElementsByTagName("button")[0];
            var buttonTextElement = theButton.querySelector("span[role=\"text\"]");
            var theChannel = tryGetChannel().slice(1);
            if (theChannel === null) return false;

            if (subscriptions.has(theChannel)) {
                buttonTextElement.innerText = "Unsubscribe";
            } else {
                buttonTextElement.innerText = "Subscribe"
            }
            theButton.onclick = async () => {
                // Make sure we are in sync
                await ensure(readStorageData);
                if (buttonTextElement.innerText === "Subscribe") {
                    try {
                        subscriptions.add(theChannel);
                        addSubscriptionVideos(theChannel);
                    } catch (e) {
                        // FIXME
                    }
                    buttonTextElement.innerText = "Unsubscribe";
                } else {
                    try {
                        subscriptions.delete(theChannel);
                        removeSubscriptionVideos(theChannel);
                    } catch (e) {
                        // FIXME
                    }
                    buttonTextElement.innerText = "Subscribe"
                }
                ensure(writeStorageData);
            };
            return true;
        }
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
ensure(() => { hijackSubscribeButton(); return false; }, waitForDomChange);

