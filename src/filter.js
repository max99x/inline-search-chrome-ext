// Find an element's absolute position, taken from:
// http://www.quirksmode.org/js/findpos.html
function findPos(obj) {
  var curleft = 0, curtop = 0;

  do {
    curleft += obj.offsetLeft;
    curtop += obj.offsetTop;
  } while (obj = obj.offsetParent);

  return [curleft, curtop];
}

function getFirstElementOfClass(cls) {
  var tags = document.getElementsByTagName('*');

  for (var i in tags) {
    if (tags[i].className == cls) {
      return tags[i]
    }
  }

  return null;
}

function applyScrolling(target, x, y) {
  if (target) {
    anchor = document.getElementById(target) || getFirstElementOfClass(target);
    if (anchor) {
      var pos = findPos(anchor);
      scrollBy(pos[0], pos[1]);
    } else if (document.readyState != 'complete') {
      setTimeout(function() {applyScrolling(target, x, y);}, 200);
    }
  }

  if (x || y) {
    scrollBy(x, y);
  }
}

// Main procedure.
if (window != top) {
  var message = {method: 'get_filter', arg: String(window.location)};
  chrome.extension.sendRequest(message, function(response) {
    if (response) {
      window.inlineSearchDisabled = true;
      applyScrolling(response.target, response.scroll.x, response.scroll.y);
    }
  });
}
