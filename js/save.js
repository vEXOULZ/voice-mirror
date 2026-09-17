// Handing the visitor a file. The one way both pages do it, whether the file
// is a take, a settings export or a reference set.

export const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked late: Safari has been known to cancel a download whose object
  // URL went away in the same tick.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};

export const saveJson = (text, name) => saveBlob(new Blob([text], { type: "application/json" }), name);
