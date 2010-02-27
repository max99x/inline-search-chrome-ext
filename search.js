// CSS-related constants. Should be synced with frame.css.
var ROOT_ID = 'chrome_inline_search_ext';
var FORM_ID = ROOT_ID + '_form';
var PADDING_TOP = 20;
var PADDING_BOTTOM = 10;
var PADDING_LEFT = 10;
var PADDING_RIGHT = 5;
var PADDING_FORM = 10;
var BASE_Z_INDEX = 65000;

// Path/URL Constants.
var HANDLE_ICON_URL = chrome.extension.getURL('handle.png');

// Internal global vars.
var body = document.getElementsByTagName('body')[0];

// Extension options with defaults.
var options = {
  url: 'http://www.tfd.com/p/$$',
  clickModifier: 'Alt',
  shortcutModifier: 'Alt',
  shortcutKey: 'W',
  shortcutEnable: true,
  shortcutSelection: true,
  frameWidth: 550,
  frameHeight: 250,
  queryFormWidth: 250,
  queryFormHeight: 50,  // This one is an approximation for centering.
  hideWithEscape: true,
  saveFrameSize: true
}

/***************************************************************
 *                          Entry Point                        *
 ***************************************************************/
// Main initialization function. Loads options and sets listeners.
function initialize() {
  // Run in top frame only.
  if (window != top) return;

  // Load options.
  function setOpt(opt) {
    chrome.extension.sendRequest({method: 'retrieve', arg: opt}, function(response) {
      if (response) options[opt] = response;
    });
  }

  for (var opt in options) {
    setOpt(opt);
  }
  
  // Manually inject the stylesheet into non-HTML pages that have no <head>.
  if (!document.head) {
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = chrome.extension.getURL('frame.css');
    
    document.body.appendChild(link);
  }
  
  // Set event listeners.
  window.addEventListener('keydown', handleKeypress, false);
  setTimeout(function() {
    if (options.clickModifier == 'None') {
      window.addEventListener('mousedown', function(e) {
        if (!isClickInsideFrame(e)) removePopup(true, true);
      }, false);
      window.addEventListener('dblclick', handleClick, false);
    } else {
      window.addEventListener('mouseup', handleClick, false);
    }
  }, 100);
}

/***************************************************************
 *                        Event Handlers                       *
 ***************************************************************/
// Handle lookup-on-click.
function handleClick(e) {
  // Ignore clicks inside frame.
  is_inside_frame = isClickInsideFrame(e);

  // Remove frame or form if one is displayed.
  if (!is_inside_frame) {
    removePopup(true, true);
    
    // If the modifier is held down and we have a selection, create a pop-up.
    if (checkModifier(options.clickModifier, e)) {
      var query = getTrimmedSelection();
      if (query != '') {
        createPopup(query, e.pageX, e.pageY, e.clientX, e.clientY, false);
        e.preventDefault();
        getSelection().removeAllRanges();
      }
    }
  }
}

// Handle keyboard shortcut.
function handleKeypress(e) {
  if (options.hideWithEscape && e.keyCode == 27) {
    removePopup(true, true);
    return;
  }

  if (!options.shortcutEnable) return;
  if (!checkModifier(options.shortcutModifier, e)) return;
  if (options.shortcutKey.charCodeAt(0) != e.keyCode) return;
  
  if (options.shortcutSelection && getTrimmedSelection() != '') {
    // Lookup selection.
    removePopup(true, true);
    createCenteredPopup(getTrimmedSelection());
  } else {
    // Show query form if it's not already visible or clear it otherwise.
    if (!document.getElementById(FORM_ID)) {
      removePopup(true, false);
      grayOut(true);
      createQueryForm();
    } else {
      document.getElementById(FORM_ID).getElementsByTagName('input')[0].value = '';
    }
  }
}

/***************************************************************
 *                        UI Controllers                       *
 ***************************************************************/
// Creates and shows the manual query form.
function createQueryForm() {
  // Calculate the coordinates of the middle of the window.
  var windowX = (window.innerWidth - (PADDING_LEFT + options.queryFormWidth + PADDING_RIGHT)) / 2 ;
  var windowY = (window.innerHeight - (PADDING_TOP + options.queryFormHeight + PADDING_BOTTOM)) / 2;
  var x = body.scrollLeft + windowX;
  var y = body.scrollTop + windowY;
  
  // Create the form, set its id and insert it.
  var qform = document.createElement('div');
  qform.id = FORM_ID;
  body.appendChild(qform);
  
  // Set form style.
  var zoom_ratio = getZoomRatio();
  qform.style.position = 'absolute';
  qform.style.left = (x / zoom_ratio) + 'px';
  qform.style.top = (y / zoom_ratio) + 'px';
  qform.style.width = options.queryFormWidth + 'px';
  qform.style.zIndex = BASE_Z_INDEX;
    
  // Add textbox.
  textbox = document.createElement('input');
  textbox.type = 'text';
  qform.appendChild(textbox);
  
  function initLookup() {
    grayOut(false);
    removePopup(false, true);
    if (textbox.value.replace(/^\s+|\s+$/g, '') != '') {
      createCenteredPopup(textbox.value);
    }
  }
  
  textbox.focus();
  
  // Add button.
  button = document.createElement('input');
  button.type = 'button';
  button.value = 'Search';
  qform.appendChild(button);
  
  // Set lookup event handlers.
  textbox.addEventListener('keypress', function(e) {
    if (e.keyCode == 13) {  // Pressed Enter.
      setTimeout(initLookup, 400);
    }
  }, false);
    
  button.addEventListener('click', function(e) {
    setTimeout(initLookup, 400);
  }, false);
  
  // Schedule a resize of the textbox to accomodate the button in a single line.
  setTimeout(function() {
    var width = options.queryFormWidth - button.offsetWidth - 2 * PADDING_FORM - 3;
    textbox.style.width = width + 'px';
  }, 100);
  
  // Initiate the fade-in animation in after 100 milliseconds.
  // Setting it now will not trigger the CSS3 animation sequence.
  setTimeout(function() {
    qform.style.opacity = 1;
  }, 100);
}

// Create a centered pop-up.
function createCenteredPopup(query) {
  var windowX = (window.innerWidth - (PADDING_LEFT + options.frameWidth + PADDING_RIGHT)) / 2;
  var windowY = (window.innerHeight - (PADDING_TOP + options.frameHeight + PADDING_BOTTOM)) / 2;

  // Create new popup.
  createPopup(query, windowX, windowY, windowX, windowY, true);
}

// Create and fade in the dictionary popup frame and button.
function createPopup(query, x, y, windowX, windowY, fixed) {
  // If an old frame still exists, wait until it is killed.
  var frame_ref = document.getElementById(ROOT_ID);
  if (frame_ref) {
    if (frame_ref.style.opacity == 1) removePopup(true, false);
    setTimeout(function() {createPopup(query, x, y, windowX, windowY, fixed);}, 50);
    return;
  }

  // Create the frame, set its id and insert it.
  var frame = document.createElement('iframe');
  frame.id = ROOT_ID;
  frame.src = options.url.replace(/\$\$/g, escape(utf8encode(query)).replace('+', '%20'));
  // Unique class to differentiate between frame instances.
  frame.className = ROOT_ID + (new Date()).getTime();
  body.appendChild(frame);
  
  // Calculate frame position.
  var window_width = window.innerWidth;
  var window_height = window.innerHeight;
  var full_frame_width = PADDING_LEFT + options.frameWidth + PADDING_RIGHT;
  var full_frame_height = PADDING_TOP + options.frameHeight + PADDING_BOTTOM;
  var top = 0;
  var left = 0;
  var zoom_ratio = getZoomRatio();
  
  if (windowX + full_frame_width * zoom_ratio >= window_width) {
    left = x / zoom_ratio - full_frame_width;
    if (left < 0) left = 5;
  } else {
    left = x / zoom_ratio;
  }
  
  if (windowY + full_frame_height * zoom_ratio >= window_height) {
    top = y / zoom_ratio - full_frame_height;
    if (top < 0) top = 5;
  } else {
    top = y / zoom_ratio;
  }
  
  // Set frame style.
  frame.style.position = fixed ? 'fixed' : 'absolute';
  frame.style.left = left + 'px';
  frame.style.top = top + 'px';
  frame.style.width = options.frameWidth + 'px';
  frame.style.height = options.frameHeight + 'px';
  frame.style.zIndex = BASE_Z_INDEX;
  
  // Create a dragging handle.
  handle = document.createElement('div');
  handle.id = ROOT_ID + '_handle';
  body.appendChild(handle);
  
  handle.style.position = fixed ? 'fixed' : 'absolute';
  handle.style.left = (left + options.frameWidth + PADDING_LEFT - 9) + 'px';
  handle.style.top = (top + options.frameHeight + PADDING_TOP + 3) + 'px';
  handle.style.background = 'url("' + HANDLE_ICON_URL + '")';
  handle.style.zIndex = BASE_Z_INDEX + 1;
  
  makeResizeable(frame, handle);
  
  // Make frame draggable by its top.
  makeMoveable(frame, PADDING_TOP);
  
  // Initiate the fade-in animation in after 100 milliseconds.
  // Setting it now will not trigger the CSS3 animation sequence.
  setTimeout(function() {
    frame.style.opacity = 1;
    handle.style.opacity = 1;
  }, 100);
}

// Fade out then destroy the frame and/or form.
function removePopup(do_frame, do_form) {
  var form = document.getElementById(FORM_ID);
  
  if (form && do_form) {
    grayOut(false);
    form.style.opacity = 0;
    setTimeout(function() {if (form) body.removeChild(form);}, 400);
  }
  
  // Remember the current frame's unique class name.
  var frame_ref = document.getElementById(ROOT_ID);
  var handle_ref = document.getElementById(ROOT_ID + '_handle');
  var frame_class = frame_ref ? frame_ref.className : null;
  
  if (frame_ref && do_frame) {
    frame_ref.style.opacity = 0;
    handle_ref.style.opacity = 0;
    setTimeout(function() {
      var frame_ref = document.getElementById(ROOT_ID);
      var handle_ref = document.getElementById(ROOT_ID + '_handle');
      // Check if the currently displayed frame is still the same as the old one.
      if (frame_ref && frame_ref.className == frame_class) {
        body.removeChild(frame_ref);
        body.removeChild(handle_ref);
      }
    }, 400);
  }
}

/***************************************************************
 *                   General Helper Functions                  *
 ***************************************************************/
// Background graying function, based on: 
// http://www.hunlock.com/blogs/Snippets:_Howto_Grey-Out_The_Screen
function grayOut(vis) {
  // Pass true to gray out screen, false to ungray.
  var dark_id = ROOT_ID + '_shader';
  var dark = document.getElementById(dark_id);
  var first_time = (dark == null);
  
  if (first_time) {
    // First time - create shading layer.
    var tnode = document.createElement('div');
    tnode.id = dark_id;
    
    tnode.style.position = 'absolute';
    tnode.style.top = '0px';
    tnode.style.left = '0px';
    tnode.style.overflow = 'hidden';
    
    document.body.appendChild(tnode);
    dark = document.getElementById(dark_id);
  }
  
  if (vis) {
    // Set the shader to cover the entire page and make it visible.
    dark.style.zIndex = BASE_Z_INDEX - 1;
    dark.style.backgroundColor = '#000000';
    dark.style.width = body.scrollWidth + 'px';
    dark.style.height = body.scrollHeight + 'px';
    dark.style.display = 'block';
    
    setTimeout(function() {dark.style.opacity = 0.7;}, 100);
  } else if (dark.style.opacity != 0) {
    setTimeout(function() {dark.style.opacity = 0;}, 100);
    setTimeout(function() {dark.style.display = 'none';}, 400);
  }
}

// Returns a trimmed version of the currently selected text.
function getTrimmedSelection() {
  var selection = String(window.getSelection());
  return selection.replace(/^\s+|\s+$/g, '');
}

// Returns the document body's zoom ratio.
function getZoomRatio() {
  var zoom_ratio = document.defaultView.getComputedStyle(body, null).getPropertyValue('zoom');
  return parseFloat(zoom_ratio || '0');
}

// Predicate to check whether the selected modifier key (and only it) is active
// in an event.
function checkModifier(modifier, e) {
  switch (modifier) {
    case 'None':
      return !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
    case 'Ctrl':
      return e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
    case 'Alt':
      return !e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey;
    case 'Meta':
      return !e.ctrlKey && !e.altKey && e.metaKey && !e.shiftKey;
    case 'Ctrl+Alt':
      return e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey;
    case 'Ctrl+Shift':
      return e.ctrlKey && !e.altKey && !e.metaKey && e.shiftKey;
    case 'Alt+Shift':
      return !e.ctrlKey && e.altKey && !e.metaKey && e.shiftKey;
    default:
      return false;
  }
}

// Makes a container resizeable through dragging a handle.
function makeResizeable(container, handle) {
  var last_position = {x: 0, y: 0};
  var ruler = document.createElement('div');
  ruler.style.visibility = 'none';
  ruler.style.width = '100px';

  function moveListener(e) {
    var moved = {x: (e.clientX - last_position.x),
                 y: (e.clientY - last_position.y)};

    var zoom_ratio = parseFloat(document.defaultView.getComputedStyle(ruler, null).getPropertyValue('width')) / 100;;
    var height = parseFloat(document.defaultView.getComputedStyle(container, null).getPropertyValue('height'));
    var width = parseFloat(document.defaultView.getComputedStyle(container, null).getPropertyValue('width'));
    var handle_left = parseFloat(document.defaultView.getComputedStyle(handle, null).getPropertyValue('left'));
    var handle_top = parseFloat(document.defaultView.getComputedStyle(handle, null).getPropertyValue('top'));

    var new_height = (height + moved.y) / zoom_ratio;
    var new_width = (width + moved.x) / zoom_ratio;
    var new_handle_left = (handle_left + moved.x) / zoom_ratio;
    var new_handle_top = (handle_top + moved.y) / zoom_ratio;

    if (moved.y > 0 || height >= 100) {
      last_position.y = e.clientY;
      container.style.height = new_height + 'px';
      handle.style.top = new_handle_top + 'px';
      
      if (options.saveFrameSize) {
        options.frameHeight = new_height;
        chrome.extension.sendRequest({method: 'store', arg: 'frameHeight', arg2: new_height}, function(response) {});
      }
    }
    if (moved.x > 0 || width >= 250) {
      last_position.x = e.clientX;
      container.style.width = new_width + 'px';
      handle.style.left = new_handle_left + 'px';
      
      if (options.saveFrameSize) {
        options.frameWidth = new_width;
        chrome.extension.sendRequest({method: 'store', arg: 'frameWidth', arg2: new_width}, function(response) {});
      }
    }
    
    e.preventDefault();
  }
  
  handle.addEventListener('mousedown', function(e) {
    last_position = {x: e.clientX, y: e.clientY};
    window.addEventListener('mousemove', moveListener);

    layer = document.createElement('div');
    body.appendChild(layer);
    layer.style.position = 'absolute';
    layer.style.top = '0px';
    layer.style.left = '0px';
    layer.style.width = '100%';
    layer.style.height = '100%';
    layer.style.opacity = '0';
    layer.style.zIndex = BASE_Z_INDEX+1;
    
    body.appendChild(ruler);
    
    window.addEventListener('mouseup', function(e) {
      window.removeEventListener('mousemove', moveListener);
      try {body.removeChild(ruler);} catch (e) {}
      try {body.removeChild(layer);} catch (e) {}
      e.preventDefault();
    });
    e.preventDefault();
  });
}

// Makes a box moveable by dragging its top margin.
function makeMoveable(box, margin) {
  var last_position = {x: 0, y: 0};

  function moveListener(e) {
    var moved = {x: (e.clientX - last_position.x),
                 y: (e.clientY - last_position.y)};
    last_position = {x: e.clientX, y: e.clientY};
    
    box.style.top = (box.offsetTop + moved.y) + 'px';
    box.style.left = (box.offsetLeft + moved.x) + 'px';
    
    var handle = document.getElementById(ROOT_ID + '_handle');
    handle.style.top = (handle.offsetTop + moved.y) + 'px';
    handle.style.left = (handle.offsetLeft + moved.x) + 'px';
    
    e.preventDefault();
  }

  box.addEventListener('mousedown', function(e) {
    var y = box.offsetTop;
    var zoom_ratio = getZoomRatio();
    var mouse_y = e.pageY / zoom_ratio;
    if (mouse_y >= y && mouse_y <= y + margin * zoom_ratio) {
      last_position = {x: e.clientX, y: e.clientY};
      
      layer = document.createElement('div');
      body.appendChild(layer);
      layer.style.position = 'absolute';
      layer.style.top = '0px';
      layer.style.left = '0px';
      layer.style.width = '100%';
      layer.style.height = '100%';
      layer.style.opacity = '0';
      layer.style.zIndex = BASE_Z_INDEX+1;
      
      window.addEventListener('mousemove', moveListener);
      window.addEventListener('mouseup', function(e) {
        window.removeEventListener('mousemove', moveListener);
        try {body.removeChild(layer);} catch (e) {}
        e.preventDefault();
      });
      e.preventDefault();
    }
  });
}

// Checks whether a click event was inside the current popup frame.
function isClickInsideFrame(e) {
  frame_ref = document.getElementById(ROOT_ID);
  
  if (frame_ref) {
    if (frame_ref.style.position == 'absolute') {
      var x = e.pageX;
      var y = e.pageY;
    } else if (frame_ref.style.position == 'fixed') {
      var x = e.clientX;
      var y = e.clientY;
    }
    
    var zoom_ratio = getZoomRatio();
    x /= zoom_ratio;
    y /= zoom_ratio;
    
    if (x >= frame_ref.offsetLeft &&
        x <= frame_ref.offsetLeft + frame_ref.offsetWidth &&
        y >= frame_ref.offsetTop &&
        y <= frame_ref.offsetTop + frame_ref.offsetHeight) {
      return true;
    }
  }
  
  return false;
}

// Encodes a string as UTF-8.
function utf8encode(string) {
  string = string.replace(/\r\n/g,"\n");
  var utftext = "";

  for (var n = 0; n < string.length; n++) {

    var c = string.charCodeAt(n);

    if (c < 128) {
      utftext += String.fromCharCode(c);
    }
    else if((c > 127) && (c < 2048)) {
      utftext += String.fromCharCode((c >> 6) | 192);
      utftext += String.fromCharCode((c & 63) | 128);
    }
    else {
      utftext += String.fromCharCode((c >> 12) | 224);
      utftext += String.fromCharCode(((c >> 6) & 63) | 128);
      utftext += String.fromCharCode((c & 63) | 128);
    }

  }

  return utftext;
}

/******************************************************************************/
initialize();
