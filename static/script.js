if (document.readyState === "complete" ||
    (document.readyState !== "loading" && !document.documentElement.doScroll)
) {
    initScript();
    initSearch();
} else {
    document.addEventListener("DOMContentLoaded", initScript);
    document.addEventListener("DOMContentLoaded", initSearch);
}

function initScript() {
    const noscript = "noscript";

    Array
        .from(document.getElementsByClassName(noscript))
        .forEach(elem => elem.classList.remove(noscript));
}

function initSearch() {
    const searchId = "search";
    const searchBoxId = "search-box";
    const contentQuery = ".content";
    const searchResultsQuery = ".search-results";
    const searchResultsItemsQuery = ".search-results-items";
    const maxItems = 10;
    const classHidden = "hidden";
    const classBlurry = "blurry";

    var search = document.getElementById(searchId);
    var searchBox = document.getElementById(searchBoxId);
    var rest = document.querySelector(contentQuery);
    var searchResults = document.querySelector(searchResultsQuery);
    var searchResultsItems = document.querySelector(searchResultsItemsQuery);

    var options = {
        bool: "AND",
        fields: {
            title: { boost: 2 },
            body: { boost: 1 },
        }
    };
    var currentTerm = "";
    var index = elasticlunr.Index.load(window.searchIndex);

    searchBox.addEventListener("keyup", debounce(function () {
        var term = searchBox.value.trim();
        if (term === currentTerm || !index) {
            return;
        }
        term === "" ? searchResults.classList.add(classHidden) : searchResults.classList.remove(classHidden);
        searchResultsItems.innerHTML = "";
        if (term === "") {
            rest.classList.remove(classBlurry);
            return;
        }

        var results = index.search(term, options);
        if (results.length === 0) {
            rest.classList.remove(classBlurry);
            searchResults.classList.add(classHidden)
            return;
        }

        rest.classList.add(classBlurry);

        currentTerm = term;
        for (let i = 0; i < Math.min(results.length, maxItems); i++) {
            var item = document.createElement("li");
            item.innerHTML = formatSearchResultItem(results[i], term.split(" "));
            searchResultsItems.appendChild(item);
        }
    }, 150));

    /*
     * Focus the search box when the '/' key is pressed.
     */
    document.onkeyup = function(e) {
        var key = e.which || e.keyCode;
        if (key === 191) {
            searchBox.focus();
        }
    }
}

function debounce(func, wait) {
    var timeout;

    return function () {
        var context = this;
        var args = arguments;
        clearTimeout(timeout);

        timeout = setTimeout(function () {
            timeout = null;
            func.apply(context, args);
        }, wait);
    };
}

// Taken from mdbook.
// The strategy is as follows:
// First, assign a value to each word in the document:
// - Words that correspond to search terms (stemmer aware): 40
// - Normal words: 2
// - First word in a sentence: 8
// Then use a sliding window with a constant number of words and count the sum
// of the values of the words within the window. Then use the window that got
// the maximum sum. If there are multiple maximas, then get the last one.
// Enclose the terms in <span class="search-term">.
function makeTeaser(body, terms) {
    const termWeight = 40;
    const normalWordWeight = 2;
    const firstWordWeight = 8;
    const teaserMaxWords = 30;
    const classSearchTerm = "search-term";

    var stemmedTerms = terms.map(function (w) {
        return elasticlunr.stemmer(w.toLowerCase());
    });
    var termFound = false;
    var index = 0;
    var weighted = []; // contains elements of ["word", weight, index_in_document]

    // split in sentences, then words
    var sentences = body.toLowerCase().split(". ");

    for (var i in sentences) {
        var words = sentences[i].split(" ");
        var value = firstWordWeight;

        for (var j in words) {
            var word = words[j];

            if (word.length > 0) {
                for (var k in stemmedTerms) {
                    if (elasticlunr.stemmer(word).startsWith(stemmedTerms[k])) {
                        value = termWeight;
                        termFound = true;
                    }
                }
                weighted.push([word, value, index]);
                value = normalWordWeight;
            }

            index += word.length;
            index += 1;  // ' ' or '.' if last word in sentence
        }

        index += 1;  // because we split at a two-char boundary '. '
    }

    if (weighted.length === 0) {
        return body;
    }

    var windowWeights = [];
    var windowSize = Math.min(weighted.length, teaserMaxWords);
    // We add a window with all the weights first
    var curSum = 0;
    for (var i = 0; i < windowSize; i++) {
        curSum += weighted[i][1];
    }
    windowWeights.push(curSum);

    for (var i = 0; i < weighted.length - windowSize; i++) {
        curSum -= weighted[i][1];
        curSum += weighted[i + windowSize][1];
        windowWeights.push(curSum);
    }

    // If we didn't find the term, just pick the first window
    var maxSumIndex = 0;
    if (termFound) {
        var maxFound = 0;
        // backwards
        for (var i = windowWeights.length - 1; i >= 0; i--) {
            if (windowWeights[i] > maxFound) {
                maxFound = windowWeights[i];
                maxSumIndex = i;
            }
        }
    }

    var teaser = [];
    var startIndex = weighted[maxSumIndex][2];
    for (var i = maxSumIndex; i < maxSumIndex + windowSize; i++) {
        var word = weighted[i];
        if (startIndex < word[2]) {
            // missing text from index to start of `word`
            teaser.push(body.substring(startIndex, word[2]));
            startIndex = word[2];
        }

        startIndex = word[2] + word[0].length;

        if (word[1] === termWeight) {
            var item = document.createElement("span");
            item.innerHTML = body.substring(word[2], startIndex)
            item.classList.add(classSearchTerm);
            teaser.push(item.outerHTML);
        } else {
            teaser.push(body.substring(word[2], startIndex));
        }
    }
    teaser.push("…");
    return teaser.join("");
}

function formatSearchResultItem(item, terms) {
    const classSearchResultsItem = "search-results-item";
    const classSearchResultsItemTitle = "search-results-item-title";
    const classSearchResultsItemSnippet = "search-results-item-snippet";
    const heading = item.doc.title === "" ? "..." : item.doc.title;

    return `<div class="${classSearchResultsItem}">`
         + `<div class="${classSearchResultsItemTitle}"><a href="${item.ref}">${heading}</a></div>`
         + `<div class="${classSearchResultsItemSnippet}">${makeTeaser(item.doc.body, terms)}</div>`
         + '</div>';
}
