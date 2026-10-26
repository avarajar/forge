export default { actions: [{ id: "status", label: "Status", effect: "read", run: { kind: "shell", command: "harvey", args: ["status"] } }] }
