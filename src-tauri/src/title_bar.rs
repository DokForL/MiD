use gtk::prelude::*;
use tauri::{AppHandle, Manager, WebviewWindow};

const STYLE_CLASS: &str = "mid-titlebar";

pub fn install(window: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    let gtk_window = window.gtk_window()?;
    if gtk_window.is_realized() {
        return Ok(());
    }

    let header = gtk::HeaderBar::builder()
        .decoration_layout(":minimize,maximize,close")
        .show_close_button(true)
        .build();
    header.style_context().add_class(STYLE_CLASS);
    let dark = gtk_window
        .settings()
        .is_some_and(|settings| settings.is_gtk_application_prefer_dark_theme());
    set_dark_class(&header.style_context(), dark);
    gtk_window
        .bind_property("title", &header, "title")
        .sync_create()
        .build();

    let css = gtk::CssProvider::new();
    css.load_from_data(include_bytes!("title_bar.css"))?;
    if let Some(screen) = WidgetExt::screen(&gtk_window) {
        gtk::StyleContext::add_provider_for_screen(
            &screen,
            &css,
            gtk::STYLE_PROVIDER_PRIORITY_APPLICATION,
        );
    }
    // Give the title bar its own input region. Interactive children keep their
    // event windows above it so GTK can still handle menu and button clicks.
    let drag_area = gtk::EventBox::builder().visible_window(false).build();
    drag_area.add_events(
        gtk::gdk::EventMask::BUTTON_PRESS_MASK
            | gtk::gdk::EventMask::BUTTON_RELEASE_MASK
            | gtk::gdk::EventMask::BUTTON_MOTION_MASK,
    );
    drag_area.add(&header);
    gtk_window.set_titlebar(Some(&drag_area));
    drag_area.show_all();
    Ok(())
}

pub fn attach_menu(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        let main = window.clone();
        // Tauri schedules GTK menu creation on the main thread in set_menu.
        window.run_on_main_thread(move || {
            if let (Some(header), Ok(content)) = (header(&main), main.default_vbox()) {
                for child in content.children() {
                    if let Ok(menu) = child.downcast::<gtk::MenuBar>() {
                        connect_menu_drag(&menu, &menu, &header);
                        for_each_submenu(&menu, &mut |popup| {
                            connect_menu_drag(popup, &menu, &header)
                        });
                        style_submenus(&menu, header.style_context().has_class("dark"));
                        content.remove(&menu);
                        header.pack_start(&menu);
                        menu.show();
                        break;
                    }
                }
            }
        })?;
    }
    Ok(())
}

pub fn set_theme(window: &WebviewWindow, dark: bool) -> tauri::Result<()> {
    let main = window.clone();
    window.run_on_main_thread(move || {
        if let Some(header) = header(&main) {
            set_dark_class(&header.style_context(), dark);
            let (red, green, blue) = if dark { (22, 22, 24) } else { (250, 250, 250) };
            // Fill newly exposed pixels while WebKit paints the larger viewport.
            let _ = main.set_background_color(Some(tauri::webview::Color(red, green, blue, 255)));
            for child in header.children() {
                if let Ok(menu) = child.downcast::<gtk::MenuBar>() {
                    style_submenus(&menu, dark);
                }
            }
        }
    })
}

fn header(window: &WebviewWindow) -> Option<gtk::HeaderBar> {
    let drag_area = window
        .gtk_window()
        .ok()?
        .titlebar()?
        .downcast::<gtk::EventBox>()
        .ok()?;
    let header = drag_area.child()?.downcast::<gtk::HeaderBar>().ok()?;
    header
        .style_context()
        .has_class(STYLE_CLASS)
        .then_some(header)
}

fn connect_menu_drag(
    receiver: &impl IsA<gtk::Widget>,
    menu: &gtk::MenuBar,
    header: &gtk::HeaderBar,
) {
    let menu = menu.downgrade();
    let header = header.downgrade();
    receiver.connect_button_press_event(move |_, event| {
        let proceed = gtk::glib::Propagation::Proceed;
        let (Some(menu), Some(header), Some(device)) =
            (menu.upgrade(), header.upgrade(), event.device())
        else {
            return proceed;
        };
        if event.button() != 1 || event.event_type() != gtk::gdk::EventType::ButtonPress {
            return proceed;
        }

        let Some(window) = header.toplevel().and_downcast::<gtk::Window>() else {
            return proceed;
        };
        let Some(surface) = window.window() else {
            return proceed;
        };
        let (root_x, root_y) = event.root();
        let (window_x, window_y) = surface.root_coords(0, 0);
        let x = root_x as i32 - window_x;
        let y = root_y as i32 - window_y;
        if !contains_point(header.upcast_ref(), &window, x, y)
            || hits_control(header.upcast_ref(), &window, x, y)
        {
            return proceed;
        }

        // Wayland requires the serial from this press. Release the menu grab
        // and start the move while the same button is still held down.
        menu.cancel();
        surface.begin_move_drag_for_device(&device, 1, root_x as i32, root_y as i32, event.time());
        gtk::glib::Propagation::Stop
    });
}

fn contains_point(widget: &gtk::Widget, window: &gtk::Window, x: i32, y: i32) -> bool {
    widget.is_visible()
        && widget
            .translate_coordinates(window, 0, 0)
            .is_some_and(|(left, top)| {
                x >= left
                    && x < left + widget.allocated_width()
                    && y >= top
                    && y < top + widget.allocated_height()
            })
}

fn hits_control(widget: &gtk::Widget, window: &gtk::Window, x: i32, y: i32) -> bool {
    if !contains_point(widget, window, x, y) {
        return false;
    }
    if widget.is::<gtk::Button>() || widget.is::<gtk::MenuBar>() {
        return true;
    }
    let mut hit = false;
    if let Some(container) = widget.downcast_ref::<gtk::Container>() {
        container.forall(|child| hit |= hits_control(child, window, x, y));
    }
    hit
}

fn style_submenus(container: &impl IsA<gtk::Container>, dark: bool) {
    for_each_submenu(container, &mut |popup| {
        let style = popup.style_context();
        style.add_class("mid-menu");
        set_dark_class(&style, dark);
    });
}

fn for_each_submenu(container: &impl IsA<gtk::Container>, visit: &mut impl FnMut(&gtk::Menu)) {
    for child in container.children() {
        let Some(popup) = child
            .downcast::<gtk::MenuItem>()
            .ok()
            .and_then(|item| item.submenu())
            .and_then(|submenu| submenu.downcast::<gtk::Menu>().ok())
        else {
            continue;
        };
        visit(&popup);
        for_each_submenu(&popup, visit);
    }
}

fn set_dark_class(style: &gtk::StyleContext, dark: bool) {
    if dark {
        style.add_class("dark");
    } else {
        style.remove_class("dark");
    }
}
