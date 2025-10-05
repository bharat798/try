document.addEventListener('DOMContentLoaded', () => {
    const browser = window.SimpleWebAuthnBrowser;
    let cropper;

    auth.onAuthStateChanged(async user => {
        if (user) {
            if (user.email === "admin@company.com") {
                auth.signOut(); 
                return;
            }
            await loadEmployeeData(user);
            initializeNavigation();
            initializeResponsiveMenu();
        } else {
            window.location.replace('index.html');
        }
    });

    function initializeResponsiveMenu() {
        const menuBtn = document.getElementById('menu-toggle-btn');
        const wrapper = document.querySelector('.dashboard-wrapper');
        if (menuBtn && wrapper) {
            menuBtn.addEventListener('click', () => {
                wrapper.classList.toggle('sidebar-open');
            });
            wrapper.addEventListener('click', (e) => {
                if (e.target === wrapper && wrapper.classList.contains('sidebar-open')) {
                    wrapper.classList.remove('sidebar-open');
                }
            });
        }
    }

    function initializeNavigation() {
        const navLinks = document.querySelectorAll('.nav-link');
        const contentViews = document.querySelectorAll('.content-view');
        const pageTitle = document.getElementById('page-title');
        const viewTitles = {
            details: 'Employee Details',
            attendance: 'Attendance System'
        };
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const view = link.getAttribute('data-view');
                pageTitle.textContent = viewTitles[view];
                navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                contentViews.forEach(v => v.classList.remove('active'));
                document.getElementById(`${view}-view`).classList.add('active');
                const wrapper = document.querySelector('.dashboard-wrapper');
                if (wrapper.classList.contains('sidebar-open')) {
                    wrapper.classList.remove('sidebar-open');
                }
            });
        });
    }

    const loadEmployeeData = async (user) => {
        try {
            const employeeDoc = await db.collection('employees').doc(user.uid).get();
            if (!employeeDoc.exists) {
                alert("Your employee data could not be found.");
                return auth.signOut();
            }
            const employeeData = employeeDoc.data();
            document.getElementById('sidebar-user-name').textContent = employeeData.name;
            const initial = employeeData.name ? employeeData.name.charAt(0).toUpperCase() : '?';
            document.getElementById('sidebar-initials-text').textContent = initial;
            document.getElementById('user-id-display').textContent = employeeData.employeeId || user.uid;
            document.getElementById('user-phone-display').textContent = employeeData.phone;
            document.getElementById('user-aadhar-display').textContent = employeeData.aadhar;
            document.getElementById('user-base-salary-display').textContent = `₹${employeeData.baseSalary.toLocaleString()}`;
            const today = new Date();
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
            const advancesSnapshot = await db.collection('employees').doc(user.uid).collection('advances').where('date', '>=', startOfMonth).get();
            let totalAdvances = 0;
            advancesSnapshot.forEach(doc => { totalAdvances += doc.data().amount; });
            document.getElementById('user-advances-display').textContent = `- ₹${totalAdvances.toLocaleString()}`;
            const attendanceSnapshot = await db.collection('attendance').where('userId', '==', user.uid).where('timestamp', '>=', startOfMonth).where('timestamp', '<=', endOfMonth).get();
            document.getElementById('days-present-display').textContent = attendanceSnapshot.size;
            document.getElementById('days-absent-display').textContent = 0;
            checkPasskeyRegistration(user.uid);
        } catch (error) {
            console.error("Error loading employee data:", error);
            alert("An error occurred while loading your data. This might be a permission issue.");
        }
    };

    document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());
    document.getElementById('register-passkey-btn').addEventListener('click', registerPasskey);
    document.getElementById('mark-attendance-btn').addEventListener('click', markAttendance);

    function bufferToBase64URL(buffer) {
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    }

    async function checkPasskeyRegistration(uid) {
        try {
            const doc = await db.collection('users').doc(uid).get();
            const registerBtn = document.getElementById('register-passkey-btn');
            if (doc.exists && doc.data().passkeyCredential) {
                registerBtn.style.display = 'none';
            } else {
                registerBtn.style.display = 'inline-flex';
            }
        } catch (error) {
            console.error("Could not check passkey registration:", error);
            alert("Could not verify passkey status. Please check your internet connection or Firebase rules.");
        }
    }

    async function registerPasskey() {
        const user = auth.currentUser;
        if (!user) return;
        
        const registerBtn = document.getElementById('register-passkey-btn');
        registerBtn.disabled = true;
        registerBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Checking...`;
        
        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists && userDoc.data().passkeyCredential) {
                alert("A passkey is already registered for this account.");
                checkPasskeyRegistration(user.uid);
                return;
            }

            registerBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Registering...`;
            const rpId = window.location.hostname;
            const challenge = crypto.getRandomValues(new Uint8Array(32));
            const registrationOptions = {
                rp: { name: 'Employee Portal', id: rpId },
                user: { id: bufferToBase64URL(new TextEncoder().encode(user.uid)), name: user.email, displayName: user.email },
                challenge: bufferToBase64URL(challenge),
                pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
                authenticatorSelection: { userVerification: 'required' }
            };

            const registrationCredential = await browser.startRegistration(registrationOptions);
            await db.collection('users').doc(user.uid).set({
                passkeyCredential: { id: registrationCredential.id }
            }, { merge: true });
            alert('Passkey registered successfully!');
            checkPasskeyRegistration(user.uid);
        } catch (error) {
            alert(`Passkey registration failed: ${error.message}`);
            console.error(error);
            registerBtn.disabled = false;
            registerBtn.innerHTML = `<i class="fas fa-id-card"></i> Register Fingerprint/Face ID`;
        }
    }

   

    async function markAttendance() {
        const user = auth.currentUser;
        if (!user) return;

        const attendanceBtn = document.getElementById('mark-attendance-btn');
        attendanceBtn.disabled = true;
        attendanceBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Verifying...`;

        try {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const attendanceQuery = await db.collection('attendance').where('userId', '==', user.uid).where('timestamp', '>=', todayStart).get();

            if (!attendanceQuery.empty) {
                alert('You have already marked your attendance today.');
                attendanceBtn.disabled = true;
                attendanceBtn.innerHTML = '<i class="fas fa-check-double"></i> Attendance Marked Today';
                return;
            }

            const userDoc = await db.collection('users').doc(user.uid).get();
            if (!userDoc.exists || !userDoc.data().passkeyCredential) {
                alert('You must register a passkey first.');
                attendanceBtn.disabled = false;
                attendanceBtn.innerHTML = `<i class="fas fa-calendar-check"></i> Mark Today's Attendance`;
                return;
            }

            const credentialId = userDoc.data().passkeyCredential.id;
            const challenge = crypto.getRandomValues(new Uint8Array(32));
            const authenticationOptions = {
                challenge: bufferToBase64URL(challenge),
                allowCredentials: [{ id: credentialId, type: 'public-key' }],
                userVerification: 'required',
            };

            await browser.startAuthentication(authenticationOptions);
            
            const employeeDoc = await db.collection('employees').doc(user.uid).get();
            const userName = employeeDoc.exists ? employeeDoc.data().name : user.email;

            await db.collection('attendance').add({
                userId: user.uid,
                name: userName,
                email: user.email,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            alert('Attendance marked successfully!');
            attendanceBtn.innerHTML = '<i class="fas fa-check-double"></i> Attendance Marked!';
            loadEmployeeData(user);

        } catch (error) {
            alert('Verification failed. Please try again.');
            console.error(error);
            attendanceBtn.disabled = false;
            attendanceBtn.innerHTML = `<i class="fas fa-calendar-check"></i> Mark Today's Attendance`;
        }
    }
});
