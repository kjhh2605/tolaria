use std::path::{Path, PathBuf};

use serde_json::{Map, Value};

use super::{
    contains_managed_mcp_server, prior_mcp_server_names, remove_prior_mcp_servers, MCP_SERVER_NAME,
};

const OPENCODE_MCP_KEY: &str = "mcp";

pub(super) fn config_path() -> Option<PathBuf> {
    dirs::config_dir().map(|config_dir| config_dir.join("opencode").join("opencode.json"))
}

pub(super) fn build_entry(node_command: &str, index_js: &str) -> Value {
    serde_json::json!({
        "type": "local",
        "command": [node_command, index_js],
        "enabled": true,
        "environment": {
            "WS_UI_PORT": "9711"
        }
    })
}

pub(super) fn upsert_config(config_path: &Path, entry: &Value) -> Result<bool, String> {
    let mut config = read_config_or_empty(config_path)?;
    let servers = ensure_servers_object(&mut config)?;
    let was_update = contains_managed_mcp_server(servers);

    remove_prior_mcp_servers(servers);
    servers.insert(MCP_SERVER_NAME.to_string(), entry.clone());
    write_config(config_path, &config)?;
    Ok(was_update)
}

pub(super) fn remove_config(config_path: &Path) -> Result<bool, String> {
    if !config_path.exists() {
        return Ok(false);
    }

    let mut config = read_config_or_empty(config_path)?;
    let Some(config_object) = config.as_object_mut() else {
        return Err("Config is not a JSON object".into());
    };
    let Some(servers_value) = config_object.get_mut(OPENCODE_MCP_KEY) else {
        return Ok(false);
    };
    let Some(servers) = servers_value.as_object_mut() else {
        return Err("mcp is not a JSON object".into());
    };

    let removed_primary = servers.remove(MCP_SERVER_NAME).is_some();
    let removed_legacy = remove_prior_mcp_servers(servers);
    if !removed_primary && !removed_legacy {
        return Ok(false);
    }

    if servers.is_empty() {
        config_object.remove(OPENCODE_MCP_KEY);
    }
    write_config(config_path, &config)?;
    Ok(true)
}

pub(super) fn read_registered_entry(config_path: &Path) -> Option<Value> {
    let raw = std::fs::read_to_string(config_path).ok()?;
    let config: Value = serde_json::from_str(&raw).ok()?;
    config
        .get(OPENCODE_MCP_KEY)
        .and_then(Value::as_object)
        .and_then(|servers| {
            servers
                .get(MCP_SERVER_NAME)
                .cloned()
                .or_else(|| {
                    prior_mcp_server_names()
                        .iter()
                        .find_map(|server_name| servers.get(server_name).cloned())
                })
        })
}

pub(super) fn entry_is_installed(entry: &Value) -> bool {
    entry["type"].as_str() == Some("local")
        && entry["enabled"].as_bool() == Some(true)
        && entry["environment"]["WS_UI_PORT"].as_str() == Some("9711")
        && command_index_js_exists(entry)
}

fn command_index_js_exists(entry: &Value) -> bool {
    entry["command"]
        .as_array()
        .and_then(|command| command.get(1))
        .and_then(Value::as_str)
        .is_some_and(|index_js| Path::new(index_js).exists())
}

fn read_config_or_empty(config_path: &Path) -> Result<Value, String> {
    if !config_path.exists() {
        return Ok(serde_json::json!({}));
    }

    let raw = std::fs::read_to_string(config_path)
        .map_err(|e| format!("Cannot read {}: {e}", config_path.display()))?;
    serde_json::from_str(&raw)
        .map_err(|e| format!("Invalid JSON in {}: {e}", config_path.display()))
}

fn ensure_servers_object(config: &mut Value) -> Result<&mut Map<String, Value>, String> {
    let servers = config
        .as_object_mut()
        .ok_or("Config is not a JSON object")?
        .entry(OPENCODE_MCP_KEY)
        .or_insert_with(|| serde_json::json!({}));

    servers
        .as_object_mut()
        .ok_or_else(|| "mcp is not a JSON object".to_string())
}

fn write_config(config_path: &Path, config: &Value) -> Result<(), String> {
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Cannot create dir {}: {e}", parent.display()))?;
    }

    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;
    std::fs::write(config_path, json)
        .map_err(|e| format!("Cannot write {}: {e}", config_path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read_config(config_path: &Path) -> Value {
        let raw = std::fs::read_to_string(config_path).unwrap();
        serde_json::from_str(&raw).unwrap()
    }

    fn write_config_json(config_path: &Path, config: Value) {
        if let Some(parent) = config_path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(config_path, serde_json::to_string(&config).unwrap()).unwrap();
    }

    #[test]
    fn build_entry_uses_opencode_schema_without_vault_path() {
        let entry = build_entry("node", "/app/mcp-server/index.js");

        assert_eq!(
            entry,
            serde_json::json!({
                "type": "local",
                "command": ["node", "/app/mcp-server/index.js"],
                "enabled": true,
                "environment": {
                    "WS_UI_PORT": "9711"
                }
            })
        );
        assert!(entry["environment"]["VAULT_PATH"].is_null());
    }

    #[test]
    fn upsert_config_preserves_other_opencode_settings() {
        let tmp = tempfile::tempdir().unwrap();
        let config_path = tmp.path().join("opencode.json");
        write_config_json(
            &config_path,
            serde_json::json!({
                "$schema": "https://opencode.ai/config.json",
                "mcp": {
                    "other": { "type": "local" }
                }
            }),
        );

        let was_update = upsert_config(&config_path, &build_entry("node", "/index.js")).unwrap();
        let config = read_config(&config_path);

        assert!(!was_update);
        assert_eq!(config["$schema"], "https://opencode.ai/config.json");
        assert!(config["mcp"]["other"].is_object());
        assert_eq!(config["mcp"][MCP_SERVER_NAME]["command"][1], "/index.js");
    }

    #[test]
    fn upsert_config_migrates_legacy_server_name() {
        let tmp = tempfile::tempdir().unwrap();
        let config_path = tmp.path().join("opencode.json");
        let prior_names = prior_mcp_server_names();
        let legacy_name = prior_names[1].as_str();
        let mut servers = Map::new();
        servers.insert(
            legacy_name.to_string(),
            serde_json::json!({ "type": "local", "command": ["node", "/old.js"] }),
        );
        write_config_json(&config_path, serde_json::json!({ "mcp": servers }));

        let was_update = upsert_config(&config_path, &build_entry("node", "/new.js")).unwrap();
        let config = read_config(&config_path);

        assert!(was_update);
        assert!(config["mcp"][legacy_name].is_null());
        assert_eq!(config["mcp"][MCP_SERVER_NAME]["command"][1], "/new.js");
    }

    #[test]
    fn remove_config_removes_primary_and_legacy_entries() {
        let tmp = tempfile::tempdir().unwrap();
        let config_path = tmp.path().join("opencode.json");
        let prior_names = prior_mcp_server_names();
        let legacy_name = prior_names[1].as_str();
        let mut servers = Map::new();
        servers.insert(MCP_SERVER_NAME.to_string(), serde_json::json!({ "type": "local" }));
        servers.insert(legacy_name.to_string(), serde_json::json!({ "type": "local" }));
        servers.insert("other".to_string(), serde_json::json!({ "type": "local" }));
        write_config_json(&config_path, serde_json::json!({ "mcp": servers }));

        assert!(remove_config(&config_path).unwrap());
        let config = read_config(&config_path);
        assert!(config["mcp"][MCP_SERVER_NAME].is_null());
        assert!(config["mcp"][legacy_name].is_null());
        assert!(config["mcp"]["other"].is_object());
    }

    #[test]
    fn entry_is_installed_checks_opencode_shape_and_index_path() {
        let tmp = tempfile::tempdir().unwrap();
        let index_js = tmp.path().join("index.js");
        std::fs::write(&index_js, "").unwrap();

        let entry = build_entry("node", &index_js.to_string_lossy());
        assert!(entry_is_installed(&entry));

        let missing = build_entry("node", &tmp.path().join("missing.js").to_string_lossy());
        assert!(!entry_is_installed(&missing));
    }
}
