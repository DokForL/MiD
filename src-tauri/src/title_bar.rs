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
    gtk_window.set_titlebar(Some(&header));
    header.show();
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
        }
    })
}

fn header(window: &WebviewWindow) -> Option<gtk::HeaderBar> {
    let header = window
        .gtk_window()
        .ok()?
        .titlebar()?
        .downcast::<gtk::HeaderBar>()
        .ok()?;
    header
        .style_context()
        .has_class(STYLE_CLASS)
        .then_some(header)
}

fn set_dark_class(style: &gtk::StyleContext, dark: bool) {
    if dark {
        style.add_class("dark");
    } else {
        style.remove_class("dark");
    }
}
