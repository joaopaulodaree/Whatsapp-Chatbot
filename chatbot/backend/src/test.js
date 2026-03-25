fetch("http://localhost:3001/api/test-client", {
    method: "POST"
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Error:', error));