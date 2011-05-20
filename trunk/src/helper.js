// Helpers to store, access and delete objects in local storage.
Storage.prototype.setObject = function(key, value) {
  this.setItem(key, JSON.stringify(value));
}
Storage.prototype.getObject = function(key) {
  try {
    return JSON.parse(this.getItem(key));
  } catch (e) {
    return null;
  }
}
Storage.prototype.delObject = function(key) {
  delete this[key];
}

// Returns the extension version as defined in the manifest.
chrome.extension.getVersion = function() {
  if (!chrome.extension.version_) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", chrome.extension.getURL('manifest.json'), false);
    xhr.onreadystatechange = function() {
      if (this.readyState == 4) {
        var manifest = JSON.parse(this.responseText);
        chrome.extension.version_ = manifest.version;
      }
    };
    xhr.send();
  }
  return chrome.extension.version_;
};

// Returns an object describing the currently selected data source.
function getCurrentSource() {
  return getSource(localStorage.getObject('selectedSource'));
}

// Returns an object describing a data source.
function getSource(name) {
  var sources = localStorage.getObject('sources');
  var selected_name = name.split('::');
  var category = selected_name[0], source_name = selected_name[1];

  for (var i in sources) {
    if (i == category) {
      for (var j in sources[i]) {
        if (j == source_name) {
          sources[i][j].category = i;
          sources[i][j].name = j;
          return sources[i][j];
        }
      }
    }
  }

  return null;
}

// Background graying function, based on:
// http://www.hunlock.com/blogs/Snippets:_Howto_Grey-Out_The_Screen
function grayOut(show, id_prefix) {
  // Pass true to gray out screen, false to ungray.
  var dark_id = (id_prefix || '') + '_shader';
  var dark = document.getElementById(dark_id);
  var first_time = (dark == null);

  if (first_time) {
    // First time - create shading layer.
    var dark = document.createElement('div');
    dark.id = dark_id;

    dark.style.position = 'absolute';
    dark.style.top = '0px';
    dark.style.left = '0px';
    dark.style.overflow = 'hidden';
    dark.style.opacity = '0';
    dark.style['-webkit-transition'] = 'opacity 0.5s ease';

    document.body.appendChild(dark);
  }

  if (show) {
    // Set the shader to cover the entire page and make it visible.
    dark.style.zIndex = 1;
    dark.style.backgroundColor = '#000000';
    dark.style.width = document.body.scrollWidth + 'px';
    dark.style.height = document.body.scrollHeight + 'px';
    dark.style.display = 'block';

    setTimeout(function() {dark.style.opacity = 0.7;}, 100);
  } else if (dark.style.opacity != 0) {
    setTimeout(function() {dark.style.opacity = 0;}, 100);
    setTimeout(function() {dark.style.display = 'none';}, 600);
  }
}
