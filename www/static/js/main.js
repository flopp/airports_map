$.fn.pressEnter = function(fn) {  
    return this.each(function() {  
        $(this).bind('enterPress', fn);
        $(this).keyup(function(e){
            if(e.keyCode == 13)
            {
              $(this).trigger("enterPress");
            }
        })
    });  
}; 


var app = {
  init : function(google_maps_key, airport_json) {
    app._google_maps_key = google_maps_key;
    app.base_url = 'BASE_URL';
    app.loading = false;
    app.load_timeout = -1;
    app.current = null;
    app.max_zoom = -1;
    app.autoplay = false;
    app.autoplay_timer = null;
    app.hide_message_timer = null;
    app.additional_copyright_div = null;
    
    var opt = {
      mapTypeId: google.maps.MapTypeId.SATELLITE,
      disableDefaultUI: true, mapTypeControl: false, navigationControl: false, disableDoubleClickZoom: false,
      draggable: false, scrollwheel: false, streetViewControl: false,
      backgroundColor: '#000000'};
    app.map = new google.maps.Map($('#map')[0],opt);
    app.max_zoom_service = new google.maps.MaxZoomService();

    app.loadAirportFromJson(airport_json);
    
    // setup event handlers
    google.maps.event.addListener(app.map, 'click', function(event) {
      app.loadAirport("");
    });

    google.maps.event.addDomListener(window, 'resize', function() {
      google.maps.event.trigger(app.map, 'resize');
      app.fitMap();
    });   
    
    $('#control-about').click(function() {
      app.openAboutOverlay();
      });
    $('#control-info').click(function() {
      app.openInfoOverlay();
      });
    $('#control-random').click(function() {
      app.loadAirport("");
      });
    $('#control-play').click(function() {
      app.toggleAutoPlay();
      });
    
    $('#about-overlay').click(function(event) {
      // don't close info overlay when clicking on a link
      if (event.target && event.target.tagName == 'A') {
        event.stopPropagation();
        return;
      }
      app.closeAboutOverlay();
      });
    $('#about-overlay .close-button').click(function(event){
      event.stopPropagation();
      app.closeAboutOverlay();
    });
    
    $('#message-container').click(function(){
      app.closeMessage();
    });
    
    $('#info-overlay').click(function(){
      app.closeInfoOverlay();
    });
    $('#info-overlay .close-button').click(function(){
      app.closeInfoOverlay();
    });
    
    $('#info-overlay #open-google-maps').click(function(event){
      event.stopPropagation();
      app.openGoogleMaps();
    });
    $('#info-overlay #info-minimap').click(function(event){
      event.stopPropagation();
      app.openGoogleMaps();
    });
    $('#info-overlay #open-ourairports').click(function(event){
      event.stopPropagation();
      app.openOurAirports();
    });
    
    $('#control-search').click(function() {
      app.showSearch();
    });
    $('#search-overlay-search').click(function(){
      app.performSearch();
    });
    $('#search-overlay-query').pressEnter(function(){
      app.performSearch();
    });
    $('#search-overlay .close-button').click(function(){
      app.closeSearch();
    });
  },

  displayMessage : function(message) {
    $('#message-container').text(message);
    $('#message-container').fadeIn(500);
    
    if (app.hide_message_timer) {
      clearInterval(app.hide_message_timer);
    }
    app.hide_message_timer = setInterval(function() { 
      app.closeMessage();
    }, 10 * 1000);
  },
  
  closeMessage : function() {
    $('#message-container').fadeOut(500);
    if (app.hide_message_timer) {
      clearInterval(app.hide_message_timer);
    }
    app.hide_message_timer = null;
  },
  
  showSearch : function() {
    app.stopAutoPlay();
    $('#controls').fadeOut(500);
    $('#label-container').fadeOut(500);
    $('#search-overlay').fadeIn(500);
    $('#search-overlay-query').val('');
    $('#search-overlay-query').focus();
  },
  
  closeSearch : function() {
    $('#controls').fadeIn(500);
    $('#label-container').fadeIn(500);
    $('#search-overlay').fadeOut(500);
  },
  
  sanitize_query : function(query) {
    return query.trim().replace(/\s+/g, ' ').toUpperCase().replace(/[^A-Za-z0-9- ]/g, '');
  },

  performSearch : function() {
    var query = $('#search-overlay-query').val();
    app.closeSearch();
    
    $.post("/api/search", { "q": query }, function(data) {
        console.log(data);
      if (typeof(data.airport) !== 'undefined' && data.airport != null) {
        app.loadAirportFromJson(data.airport);
      } else {
        app.displayMessage('Cannot find airport matching "' + query + '".');
      }
    });
  },

  getBoundsZoomLevel : function(bounds) {
    var WORLD_DIM = { height: 256, width: 256 };
    var ZOOM_MAX = 21;

    function latRad(lat) {
        var sin = Math.sin(lat * Math.PI / 180);
        var radX2 = Math.log((1 + sin) / (1 - sin)) / 2;
        return Math.max(Math.min(radX2, Math.PI), -Math.PI) / 2;
    }

    function zoom(mapPx, worldPx, fraction) {
        return Math.floor(Math.log(mapPx / worldPx / fraction) / Math.LN2);
    }

    var ne = bounds.getNorthEast();
    var sw = bounds.getSouthWest();

    var latFraction = (latRad(ne.lat()) - latRad(sw.lat())) / Math.PI;

    var lngDiff = ne.lng() - sw.lng();
    var lngFraction = ((lngDiff < 0) ? (lngDiff + 360) : lngDiff) / 360;

    var latZoom = zoom($('#map').height(), WORLD_DIM.height, latFraction);
    var lngZoom = zoom($('#map').width(), WORLD_DIM.width, lngFraction);

    return Math.min(latZoom, lngZoom, ZOOM_MAX);
  },
  
  adjustZoom : function() {
      var needed_zoom = app.current.get_zoom();
      if (!app.current.get_bounds().getNorthEast().equals(app.current.get_bounds().getSouthWest())) {
        needed_zoom = app.getBoundsZoomLevel(app.current.get_bounds());
      }
      
      if (app.max_zoom < 0) {
        app.map.setZoom(needed_zoom);
      } else {
        app.map.setZoom(Math.min(needed_zoom, app.max_zoom));
      }
  },
    
  fitMap : function() {
    if (!app.current) return;
    
    google.maps.event.trigger(app.map, 'resize');
    app.map.setCenter(app.current.get_pos());
    
    if (app.max_zoom < 0) {
      app.max_zoom_service.getMaxZoomAtLatLng(app.current.get_pos(), function(response) {
        if (response.status == google.maps.MaxZoomStatus.OK) {
          app.max_zoom = response.zoom;
        } else {
          app.max_zoom = -1;
        }
        app.adjustZoom();
      });
    } else {
      app.adjustZoom();
    }
  },
  
  startAutoPlay : function() {
    app.autoplay = true;
    $('#control-play > i').removeClass('fa-play').addClass('fa-pause');
    if (app.autoplay_timer) {
      clearInterval(app.autoplay_timer);
    }
    app.autoplay_timer = setInterval(function() { 
      app.loadAirport(""); 
      }, 60 * 1000);
  },
  
  stopAutoPlay : function() {
    if (app.autoplay_timer) {
      clearInterval(app.autoplay_timer);
      app.autoplay_timer = null;
    }
    $('#control-play > i').removeClass('fa-pause').addClass('fa-play');
    app.autoplay = false;
  },
  
  toggleAutoPlay : function () {
    if (app.autoplay) {
      app.stopAutoPlay();
    } else {
      app.startAutoPlay();
    }
  },
  
  openGoogleMaps : function() {
    if (!app.current) return;
    var url = "https://www.google.com/maps/@" + app.map.getCenter().lat().toFixed(6) + "," + app.map.getCenter().lng().toFixed(6) + "," + app.map.getZoom() + "z";
    window.open(url, '_blank');
  },
  
  openOurAirports : function() {
    if (!app.current) return;
    var url = "http://ourairports.com/airports/" + app.current.get_code();
    window.open(url, '_blank');
  },

  openAboutOverlay : function() {
    $('#controls').fadeOut(500);
    $('#label-container').fadeOut(500);
    $('#about-overlay').fadeIn(500);
  },

  closeAboutOverlay : function() {
    $('#about-overlay').fadeOut(500);
    $('#controls').fadeIn(500);
    $('#label-container').fadeIn(500);
  },
  
  jumpTo: function(id) {
      event.stopPropagation();
      app.closeInfoOverlay();
      app.closeSearch();
      app.loadAirport(id);
  },

  openInfoOverlay : function() {
    app.stopAutoPlay();
    $('#info-label').text(app.current.get_label());
    $('#info-location').text(app.current.get_location_name());
    $('#info-minimap').attr("src", "http://maps.googleapis.com/maps/api/staticmap?key=" + app._google_maps_key + "&zoom=2&size=500x300&markers=color:blue|" + app.map.getCenter().lat().toFixed(6) + "," + app.map.getCenter().lng().toFixed(6));
    
    $('#controls').fadeOut(500);
    $('#label-container').fadeOut(500);
    $('#info-overlay').fadeIn(500);
  },

  closeInfoOverlay : function() {
    $('#info-overlay').fadeOut(500);
    $('#controls').fadeIn(500);
    $('#label-container').fadeIn(500);
  },

  updateLabel : function() {
    if (app.current) {
        window.history.replaceState({}, app.current.get_label() + " [Random Aiports]", "/a/" + app.current.get_code());
        $('link[rel="canonical"]').attr('href', app.base_url + '/a/' + app.current.get_code());
        $('#label').html(app.current.get_label());
        $('#location').html(app.current.get_location_name());
        document.title = app.current.get_label() + " [Random Aiports]";
    } else {
        window.history.replaceState({}, "[Random Aiports]", "/");
        $('link[rel="canonical"]').attr('href', app.base_url);
        $('#label').html('Random Airports');
        $('#location').html('');
        document.title = "[Random Aiports]";
    }
  },

  onStartLoading : function() {
    if (!app.loading) {
      return;
    }
    
    if (app.load_timeout != -1) {
      clearTimeout(app.load_timeout);
      app.load_timeout = -1;
    }
    
    google.maps.event.clearListeners(app.map, 'tilesloaded');
    
    var map_buffer = $('#map-buffer');
    if (map_buffer) {
      map_buffer.remove();
    }
    
    $('#control-random > i').addClass('fa-spin');
    $('#container').prepend($('#map').clone(false).attr('id','map-buffer'));
  },
  
  onFinishLoading : function() {
    if (!app.loading) {
      return;
    }
    
    if (app.load_timeout != -1) {
      clearTimeout(app.load_timeout);
      app.load_timeout = -1;
    }
    
    google.maps.event.clearListeners(app.map, 'tilesloaded');
    
    var map_buffer = $('#map-buffer');
    if (map_buffer) {
      map_buffer.remove();
    }
    
    $('#control-random > i').removeClass('fa-spin');
    app.loading = false;
  },
  
  loadAirport : function(airport_id) {
    if (app.loading) {
      return;
    }
    app.loading = true;
    app.onStartLoading();

    airport_id = app.sanitize_query(airport_id);
    if (airport_id != "") {
      console.log("loading " + airport_id + "...");
      $.get("/api/get/" + airport_id, function(data) {
        if (typeof(data.airport) !== 'undefined' && typeof(data.airport.id) !== 'undefined') {
            app.loadAirportFromJson(data.airport);
        } else {
            app.displayMessage('Error loading requested airport (' + airport_id + '). Loading a random airport instead.');
            app.current = null;
            app.onFinishLoading();
            app.loadAirport("");
        }
      });
    } else {
      console.log("loading random airport...");
      $.get("/api/random", function(data) {
        if (typeof(data.airport) !== 'undefined' && typeof(data.airport.id) !== 'undefined') {
            app.loadAirportFromJson(data.airport);
        } else {
            app.displayMessage('Error loading random airport.');
            app.current = null;
            app.onFinishLoading();
        }
      });
    }
  },
  
  loadAirportFromJson : function(json_airport) {
    if (typeof(json_airport.id) == 'undefined') {
        return;
    }
    
    app.current = new Airport;
    app.current.load_from_json(json_airport);
          
    google.maps.event.addListenerOnce(app.map, 'tilesloaded', function(){
        $('#map-buffer').fadeOut(500, function(){ app.onFinishLoading(); });
        app.updateLabel();
    });
    app.load_timeout = setTimeout(function(){ 
        $('#map-buffer').fadeOut(500, function(){ app.onFinishLoading(); });
        app.updateLabel();
    }, 5000);
  
    app.max_zoom = -1;
    app.fitMap();
  },
};
