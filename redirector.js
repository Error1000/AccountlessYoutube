function normaliseUrl(url){
	if(url.endsWith("/")){
		url = url.slice(0, -1);
	}
	return url;
}

tracked_tabs = new Set([])


// Track all tabs
browser.tabs.onCreated.addListener((tab) => {
    tracked_tabs.add(tab.id);
})


browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if(changeInfo.hasOwnProperty("url")){
        
    }
    if(tracked_tabs.has(tabId)){
        if(changeInfo.hasOwnProperty("url")){
            let normalisedUrl = normaliseUrl(changeInfo.url);

            // If any tab from the tracked tabs accesses any youtube website then remove it from the tracked tabs
            if(normalisedUrl.startsWith("https://www.youtube.com")){
                tracked_tabs.delete(tabId);
            }

            // If any tracked tab accesses the plain youtube website then redirect it to the subs page
	        if(normalisedUrl === "https://www.youtube.com") {
                browser.tabs.update(tabId, {url: "https://www.youtube.com/feed/subscriptions"});
	        }
        }
    }
});
