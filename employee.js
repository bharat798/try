document.addEventListener('DOMContentLoaded', () => {
    const browser = window.SimpleWebAuthnBrowser;
    let calendarDate = new Date();
    let currentUserUid = null;

    const formatDate = (d) => d ? (d.toDate ? d.toDate() : new Date(d)).toLocaleDateString('en-GB') : 'N/A';
    const formatCurrency = (amount) => `₹${parseFloat(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    auth.onAuthStateChanged(async user => {
        if (user) {
            if (user.email === "admin@company.com") {
                auth.signOut(); 
                return;
            }
            currentUserUid = user.uid;
            await loadEmployeeData(user);
            initializeNavigation();
            initializeResponsiveMenu(); 
            initializeTransactionHistory();
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
            attendance: 'Attendance System',
            transactions: 'Transaction History'
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
                if (view === 'transactions' && currentUserUid) {
                    loadTransactionHistory(currentUserUid);
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
            const joiningDate = employeeData.joiningDate ? employeeData.joiningDate.toDate() : null;

            document.getElementById('sidebar-user-name').textContent = employeeData.name;
            const initial = employeeData.name ? employeeData.name.charAt(0).toUpperCase() : '?';
            document.getElementById('sidebar-initials-text').textContent = initial;
            document.getElementById('user-id-display').textContent = employeeData.employeeId || user.uid;
            document.getElementById('user-phone-display').textContent = employeeData.phone;
            document.getElementById('user-aadhar-display').textContent = employeeData.aadhar;
            document.getElementById('user-base-salary-display').textContent = `₹${employeeData.baseSalary.toLocaleString()}`;
            
            const today = new Date();
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            
            const advancesSnapshot = await db.collection('employees').doc(user.uid).collection('advances').where('date', '>=', startOfMonth).get();
            let totalAdvances = 0;
            advancesSnapshot.forEach(doc => { totalAdvances += doc.data().amount; });
            document.getElementById('user-advances-display').textContent = `- ${formatCurrency(totalAdvances)}`;
            
            const attendanceSnapshot = await db.collection('attendance').where('userId', '==', user.uid).where('timestamp', '>=', startOfMonth).get();
            const presentDays = attendanceSnapshot.size;
            document.getElementById('days-present-display').textContent = presentDays;
            
            let absentDays = 0;
            const todayDate = today.getDate();
            const presentDates = new Set(attendanceSnapshot.docs.map(doc => doc.data().timestamp.toDate().getDate()));
            
            const monthStartDate = joiningDate && joiningDate.getMonth() === today.getMonth() && joiningDate.getFullYear() === today.getFullYear() 
                ? joiningDate.getDate() 
                : 1;

            for (let i = monthStartDate; i < todayDate; i++) {
                if (!presentDates.has(i)) {
                    absentDays++;
                }
            }
            document.getElementById('days-absent-display').textContent = absentDays;

            const paymentsSnapshot = await db.collection('employees').doc(user.uid).collection('payments').where('datePaid', '>=', startOfMonth).get();
            let totalPaid = 0;
            paymentsSnapshot.forEach(doc => { totalPaid += doc.data().amountPaid; });
            document.getElementById('user-already-paid-display').textContent = `- ${formatCurrency(totalPaid)}`;

            const earnedSalary = (employeeData.baseSalary / 30) * presentDays;
            const netPayable = Math.max(0, earnedSalary - totalAdvances - totalPaid);
            document.getElementById('user-net-payable-display').textContent = formatCurrency(netPayable);

            const fullHistorySnap = await db.collection('attendance').where('userId', '==', user.uid).get();
            const history = fullHistorySnap.docs.map(doc => ({ Timestamp: doc.data().timestamp.toDate() }));
            
            calendarDate = new Date();
            // Joining date ko calendar function mein pass kiya gaya hai
            const updateCalendar = () => generateCalendar(calendarDate.getFullYear(), calendarDate.getMonth(), history, 'employee', employeeData.joiningDate);
            document.getElementById('employee-cal-prev-month-btn').onclick = () => { calendarDate.setMonth(calendarDate.getMonth() - 1); updateCalendar(); };
            document.getElementById('employee-cal-next-month-btn').onclick = () => { calendarDate.setMonth(calendarDate.getMonth() + 1); updateCalendar(); };
            updateCalendar();

            checkPasskeyRegistration(user.uid);
        } catch (error) {
            console.error("Error loading employee data:", error);
            alert("An error occurred while loading your data.");
        }
    };
            
    document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());
    document.getElementById('register-passkey-btn').addEventListener('click', registerPasskey);
    document.getElementById('mark-attendance-btn').addEventListener('click', markAttendance);

    function generateCalendar(year, month, history, prefix, joiningDate) {
        const grid = document.getElementById(`${prefix}-cal-days-grid`);
        const monthDisplay = document.getElementById(`${prefix}-cal-month-year-display`);
        const summary = document.getElementById(`${prefix}-cal-summary`);
        
        if (!grid || !monthDisplay || !summary) return;

        monthDisplay.textContent = `${new Date(year, month).toLocaleString('default', { month: 'long' })} ${year}`;
        grid.innerHTML = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<div class="calendar-day-name">${d}</div>`).join('');
        
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        
        grid.innerHTML += Array(firstDay).fill('<div class="calendar-date empty"></div>').join('');
        
        const today = new Date();
        today.setHours(0,0,0,0);

        // Joining date ko saaf format mein convert kiya gaya
        const joiningDateObj = joiningDate ? (joiningDate.toDate ? joiningDate.toDate() : new Date(joiningDate)) : null;
        if (joiningDateObj) {
            joiningDateObj.setHours(0,0,0,0);
        }

        let absentCount = 0;
        const presentCount = history.filter(r => new Date(r.Timestamp).getFullYear() === year && new Date(r.Timestamp).getMonth() === month).length;

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            date.setHours(0,0,0,0);
            
            const isPresent = history.some(r => new Date(r.Timestamp).setHours(0,0,0,0) === date.getTime());
            
            let dayClass = '';
            if (isPresent) {
                dayClass = 'present-day';
            } else if (date < today && (!joiningDateObj || date >= joiningDateObj)) { 
                // Yahan check kiya gaya hai ki din joining date ke baad ka ho
                dayClass = 'absent-day';
                absentCount++;
            }
            grid.innerHTML += `<div class="calendar-date ${dayClass}">${day}</div>`;
        }
        
        // Summary mein absent count joda gaya
        summary.innerHTML = `
            <div class="summary-item"><i class="fas fa-check-circle present-icon"></i> Present: <strong>${presentCount} days</strong></div>
            <div class="summary-item"><i class="fas fa-times-circle absent-icon"></i> Absent: <strong>${absentCount} days</strong></div>
        `;
    }

    function bufferToBase64URL(buffer) {
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    }

    async function checkPasskeyRegistration(uid) {
        const doc = await db.collection('users').doc(uid).get();
        const registerBtn = document.getElementById('register-passkey-btn');
        if (doc.exists && doc.data().passkeyCredential) {
            registerBtn.style.display = 'none';
        } else {
            registerBtn.style.display = 'inline-flex';
        }
    }

    async function registerPasskey() {
        const user = auth.currentUser;
        if (!user) return;
        
        const registerBtn = document.getElementById('register-passkey-btn');
        registerBtn.disabled = true;
        registerBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Checking...`;
        
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

        try {
            const registrationCredential = await browser.startRegistration(registrationOptions);
            await db.collection('users').doc(user.uid).set({
                passkeyCredential: { id: registrationCredential.id }
            }, { merge: true });
            alert('Passkey registered successfully!');
            checkPasskeyRegistration(user.uid);
        } catch (error) {
            alert('Passkey registration failed. Please try again.');
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

    function initializeTransactionHistory() {
        const yearFilter = document.getElementById('transaction-year-filter');
        const monthFilter = document.getElementById('transaction-month-filter');
        const currentYear = new Date().getFullYear();

        yearFilter.innerHTML = '<option value="all">All Years</option>';
        for (let i = currentYear; i >= currentYear - 5; i--) {
            yearFilter.innerHTML += `<option value="${i}">${i}</option>`;
        }
        
        const applyFilters = () => {
            if (currentUserUid) {
                loadTransactionHistory(currentUserUid, yearFilter.value, monthFilter.value);
            }
        };

        yearFilter.addEventListener('change', applyFilters);
        monthFilter.addEventListener('change', applyFilters);
    }

    async function loadTransactionHistory(uid, year = 'all', month = 'all') {
        const transactionList = document.getElementById('transaction-list');
        transactionList.innerHTML = '<p class="loading-text"><i class="fas fa-spinner fa-spin"></i> Loading transactions...</p>';

        try {
            const employeeDocRef = db.collection('employees').doc(uid);
            let advancesQuery = employeeDocRef.collection('advances');
            let paymentsQuery = employeeDocRef.collection('payments');

            let startFilter, endFilter;
            if (year !== 'all') {
                if (month !== 'all') {
                    startFilter = new Date(parseInt(year), parseInt(month), 1);
                    endFilter = new Date(parseInt(year), parseInt(month) + 1, 0, 23, 59, 59);
                } else {
                    startFilter = new Date(parseInt(year), 0, 1);
                    endFilter = new Date(parseInt(year), 11, 31, 23, 59, 59);
                }
            } else if (month !== 'all') { 
                // Client-side filter for this case
            }

            if (startFilter) {
                advancesQuery = advancesQuery.where('date', '>=', startFilter).where('date', '<=', endFilter);
                paymentsQuery = paymentsQuery.where('datePaid', '>=', startFilter).where('datePaid', '<=', endFilter);
            }

            const [advancesSnap, paymentsSnap] = await Promise.all([
                advancesQuery.orderBy('date', 'desc').get(),
                paymentsQuery.orderBy('datePaid', 'desc').get()
            ]);

            let transactions = [];
            advancesSnap.docs.forEach(doc => transactions.push({ type: 'advance', date: doc.data().date.toDate(), amount: doc.data().amount }));
            paymentsSnap.docs.forEach(doc => transactions.push({ type: 'payment', date: doc.data().datePaid.toDate(), amount: doc.data().amountPaid }));
            
            if (year === 'all' && month !== 'all') {
                transactions = transactions.filter(tx => tx.date.getMonth() === parseInt(month));
            }
            
            transactions.sort((a, b) => b.date.getTime() - a.date.getTime());

            if (transactions.length === 0) {
                transactionList.innerHTML = '<p class="no-data-text"><i class="fas fa-info-circle"></i> No transactions found for this period.</p>';
                return;
            }

            let html = '';
            transactions.forEach(tx => {
                const typeClass = tx.type === 'payment' ? 'salary-paid' : 'advance-taken';
                const icon = tx.type === 'payment' ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-arrow-down"></i>';
                const label = tx.type === 'payment' ? 'Salary Paid' : 'Advance Taken';
                const amountClass = tx.type === 'payment' ? 'success-text' : 'danger-text';

                html += `
                    <div class="transaction-item ${typeClass}">
                        <div class="transaction-icon">${icon}</div>
                        <div class="transaction-details">
                            <span class="transaction-label">${label}</span>
                            <span class="transaction-date">${tx.date.toLocaleDateString('en-GB')}</span>
                        </div>
                        <div class="transaction-amount ${amountClass}">${tx.type === 'payment' ? '' : '- '}${formatCurrency(tx.amount)}</div>
                    </div>
                `;
            });
            transactionList.innerHTML = html;

        } catch (error) {
            console.error("Error loading transaction history:", error);
            transactionList.innerHTML = `<p class="error-text"><i class="fas fa-exclamation-triangle"></i> Failed to load transactions: ${error.message}</p>`;
        }
    }
});
