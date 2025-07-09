
            // Custom Toast Function
            function showToast(message, type = "success") {
                const toast = document.getElementById("toast");
                toast.textContent = message;
                toast.className = `show ${type}`;
                setTimeout(() => {
                    toast.className = toast.className.replace(`show ${type}`, "");
                }, 3000);
            }

            document.getElementById("waitlist-form").addEventListener("submit", function(e){
                e.preventDefault();
                const form = e.target;
                const formData = new FormData(form);
                fetch(form.action, { method: 'POST', body: formData })
                .then(response => response.text())
                .then(data => {
                    showToast("Successfully submitted! Thank you for joining.", "success");
                    form.reset();
                })
                .catch(error => {
                    console.error(error);
                    showToast("❌ Submission failed. Please try again.", "error");
                });
            });