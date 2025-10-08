document.addEventListener('DOMContentLoaded', () => {
    let allEmployeeData = [];
    let currentlyViewedEmployee = null;
    let calendarDate = new Date();

    auth.onAuthStateChanged(user => {
        if (user && user.email === "admin@company.com") {
            initializeAdminDashboard();
        } else {
            window.location.replace('index.html');
        }
    });

    const formatDate = (d) => d ? (d.toDate ? d.toDate() : new Date(d)).toLocaleDateString('en-GB') : 'N/A';
    const formatCurrency = (amount) => `₹${parseFloat(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const generateEmployeeId = () => {
        const date = new Date();
        const year = String(date.getFullYear()).slice(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const randomDigits = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
        return `EMP${year}${month}${randomDigits}`;
    };
    
    const showModal = (modal) => { 
        if (!modal) return;
        document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
        document.getElementById('modal-container').classList.add('show');
        modal.style.display = 'block';
    };

    const hideModals = () => { 
        const container = document.getElementById('modal-container');
        if (container) container.classList.remove('show');
    };

    const showMessage = (title, text, isSuccess = true) => {
        const messageModal = document.getElementById('message-modal');
        if (!messageModal) return;
        messageModal.querySelector('#message-title').textContent = title;
        messageModal.querySelector('#message-text').textContent = text;
        messageModal.querySelector('#message-icon').innerHTML = isSuccess 
            ? '<i class="fas fa-check-circle" style="color: green; font-size: 3em;"></i>' 
            : '<i class="fas fa-times-circle" style="color: red; font-size: 3em;"></i>';
        showModal(messageModal);
    };

    // YAHAN BADLAV KIYA GAYA HAI: showMessage function ko global banaya gaya hai
    window.showMessage = showMessage;
    window.showModal = showModal;
    window.hideModals = hideModals;

    function initializeAdminDashboard() {
        initializeNavigation();
        loadDashboardOverview();
        initializeModalsAndForms();
        initializeResponsiveMenu();
    }

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
        const viewMap = {
            'dashboard-overview': { title: 'Dashboard Overview', func: loadDashboardOverview },
            'manage-employees': { title: 'Manage Employees', func: loadManageEmployees },
            'attendance-feed': { title: "Today's Attendance", func: listenForAttendance },
            'attendance-history': { title: 'Attendance History', func: loadAttendanceHistory },
            'salary-advances': { title: 'Salary Advances', func: loadSalaryAdvances },
            'payroll-reports': { title: 'Reports & Analytics', func: () => document.dispatchEvent(new CustomEvent('loadReports')) }
        };
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const viewName = link.dataset.view;
                document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                document.querySelectorAll('.content-view').forEach(v => v.classList.remove('active'));
                document.getElementById(`${viewName}-view`).classList.add('active');
                document.getElementById('page-title').textContent = viewMap[viewName].title;
                if (viewMap[viewName].func) viewMap[viewName].func();
                const wrapper = document.querySelector('.dashboard-wrapper');
                if (wrapper.classList.contains('sidebar-open')) {
                    wrapper.classList.remove('sidebar-open');
                }
            });
        });
    }

    async function fetchDataAndProcess() {
        const empSnap = await db.collection('employees').get();
        const employees = empSnap.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        
        const dataPromises = employees.map(async emp => {
            const attenSnap = await db.collection('attendance').where('userId', '==', emp.uid).where('timestamp', '>=', startOfMonth).get();
            const advSnap = await db.collection('employees').doc(emp.docId).collection('advances').where('date', '>=', startOfMonth).get();
            const presentDays = attenSnap.size;
            const totalAdvances = advSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
            const netPayable = Math.max(0, (emp.baseSalary / 30) * presentDays - totalAdvances);
            return { ...emp, presentDays, totalAdvances, netPayable: Math.round(netPayable) };
        });

        allEmployeeData = await Promise.all(dataPromises);
        return true;
    }

    async function loadDashboardOverview() {
        await fetchDataAndProcess();
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayAtten = await db.collection('attendance').where('timestamp', '>=', todayStart).get();
        const totalSalary = allEmployeeData.reduce((sum, e) => sum + e.baseSalary, 0);
        document.getElementById('stats-grid-container').innerHTML = `
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-users"></i></div><div class="stat-info"><h3>Total Employees</h3><p>${allEmployeeData.length}</p></div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-calendar-check"></i></div><div class="stat-info"><h3>Today's Check-ins</h3><p>${todayAtten.size}</p></div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-user-clock"></i></div><div class="stat-info"><h3>Not Checked In</h3><p>${allEmployeeData.length - todayAtten.size}</p></div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-money-bill-wave"></i></div><div class="stat-info"><h3>Total Monthly Salary</h3><p>₹${totalSalary.toLocaleString('en-IN')}</p></div></div>
        `;
    }

    async function loadManageEmployees() {
        await fetchDataAndProcess();
        const tableBody = document.getElementById('admin-table-body');
        tableBody.innerHTML = allEmployeeData.map(emp => `
            <tr>
                <td>${emp.employeeId || 'N/A'}</td>
                <td>${emp.name}</td>
                <td>${emp.phone}</td>
                <td>${formatDate(emp.joiningDate)}</td>
                <td>₹${emp.baseSalary.toLocaleString('en-IN')}</td>
                <td class="actions-cell">
                    <button class="btn btn-primary btn-small view-details-btn" data-uid="${emp.uid}"><i class="fas fa-eye"></i> View</button>
                    <button class="btn btn-danger btn-small delete-employee-btn" data-docid="${emp.docId}" data-name="${emp.name}"><i class="fas fa-trash"></i> Delete</button>
                </td>
            </tr>`).join('');
        tableBody.querySelectorAll('.view-details-btn').forEach(btn => btn.addEventListener('click', (e) => showEmployeeDetailsModal(e.currentTarget.dataset.uid)));
        tableBody.querySelectorAll('.delete-employee-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const { docid, name } = e.currentTarget.dataset;
                if (confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) {
                    deleteEmployee(docid, name);
                }
            });
        });
    }
    
    async function deleteEmployee(docId, name) {
        try {
            await db.collection('employees').doc(docId).delete();
            showMessage("Success", `${name} has been deleted.`, true);
            loadManageEmployees();
        } catch (error) {
            showMessage("Error", `Could not delete employee: ${error.message}`, false);
        }
    }

    function listenForAttendance() {
        const tableBody = document.getElementById('attendance-list-table-body');
        const todayStart = new Date(); 
        todayStart.setHours(0, 0, 0, 0);
        db.collection('attendance').where('timestamp', '>=', todayStart).orderBy('timestamp', 'desc').onSnapshot(snap => {
            if (snap.empty) {
                tableBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No attendance marked yet today.</td></tr>';
                return;
            }
            tableBody.innerHTML = snap.docs.map(doc => {
                const data = doc.data();
                const time = data.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return `<tr><td>${data.name}</td><td>${data.email}</td><td>${time}</td></tr>`;
            }).join('');
        });
    }

    function loadAttendanceHistory() {
        const dateFilter = document.getElementById('history-date-filter');
        const tableBody = document.getElementById('attendance-history-table-body');
        const filterAttendance = async () => {
            if (!dateFilter.value) return;
            const selectedDate = new Date(dateFilter.value);
            const start = new Date(selectedDate); start.setHours(0,0,0,0);
            const end = new Date(selectedDate); end.setHours(23,59,59,999);
            const snap = await db.collection('attendance').where('timestamp', '>=', start).where('timestamp', '<=', end).orderBy('timestamp', 'desc').get();
            if (snap.empty) { tableBody.innerHTML = `<tr><td colspan="4">No records found for ${formatDate(selectedDate)}.</td></tr>`; return; }
            tableBody.innerHTML = snap.docs.map(doc => `<tr><td>${formatDate(doc.data().timestamp)}</td><td>${doc.data().name}</td><td>${doc.data().email}</td><td>${doc.data().timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td></tr>`).join('');
        };
        document.getElementById('filter-attendance-btn').onclick = filterAttendance;
        dateFilter.valueAsDate = new Date();
        filterAttendance();
    }
    
    async function loadSalaryAdvances() {
        await fetchDataAndProcess();
        const list = document.getElementById('employee-advance-list');
        list.innerHTML = allEmployeeData.map(emp => `<li data-docid="${emp.docId}">${emp.name}</li>`).join('');
        list.querySelectorAll('li').forEach(li => li.addEventListener('click', e => showAdvanceDetailsModal(e.currentTarget.dataset.docid)));
    }

    function initializeModalsAndForms() {
        document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());
        document.querySelectorAll('.modal .btn-secondary, .modal .btn-primary[id^="close-"]').forEach(btn => btn.addEventListener('click', hideModals));
        document.getElementById('enroll-btn-quick').addEventListener('click', () => showModal(document.getElementById('enroll-modal')));
        document.getElementById('enroll-btn-main').addEventListener('click', () => showModal(document.getElementById('enroll-modal')));
        
        document.getElementById('enroll-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const phone = document.getElementById('phone').value;
            const aadhar = document.getElementById('aadhar').value;
            const baseSalary = parseFloat(document.getElementById('salary').value);
            const joiningDate = new Date(document.getElementById('joining-date').value);
            
            if (password.length < 6) return showMessage("Error", "Password must be at least 6 characters.", false);

            try {
                const tempApp = firebase.initializeApp(firebase.app().options, 'secondary' + new Date().getTime());
                const userCredential = await tempApp.auth().createUserWithEmailAndPassword(email, password);
                const uid = userCredential.user.uid;
                await tempApp.auth().signOut();
                await tempApp.delete();

                const employeeId = generateEmployeeId();
                const newEmployeeData = { uid, employeeId, name, email, phone, aadhar, baseSalary, joiningDate };
                await db.collection('employees').doc(uid).set(newEmployeeData);
                await db.collection('users').doc(uid).set({ name, email });
                
                hideModals();
                showMessage("Success", `Employee ${name} enrolled successfully!`, true);
                e.target.reset();
                loadManageEmployees();

            } catch (error) {
                if (error.code === 'auth/email-already-in-use') {
                    showMessage("Error", "This email is already registered.", false);
                } else {
                    showMessage("Error", `Enrollment failed: ${error.message}`, false);
                }
                console.error("Enrollment Error:", error);
            }
        });
        
        document.getElementById('record-advance-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = parseFloat(document.getElementById('advance-amount').value);
            const advanceDate = new Date(document.getElementById('advance-date').value);
            if (!currentlyViewedEmployee || !amount || !advanceDate) return showMessage("Error", "Please fill all fields.", false);

            try {
                await db.collection('employees').doc(currentlyViewedEmployee.docId).collection('advances').add({ 
                    amount, 
                    date: firebase.firestore.Timestamp.fromDate(advanceDate)
                });
                showMessage("Success", "Advance recorded.", true);
                e.target.reset();
                showAdvanceDetailsModal(currentlyViewedEmployee.docId);
            } catch (error) {
                showMessage("Error", `Failed to record advance: ${error.message}`, false);
            }
        });
    }

    async function showAdvanceDetailsModal(docId) {
        currentlyViewedEmployee = allEmployeeData.find(e => e.docId === docId);
        if (!currentlyViewedEmployee) return;

        const emp = currentlyViewedEmployee;
        document.getElementById('adv-modal-name').textContent = emp.name;
        document.getElementById('advance-date').valueAsDate = new Date();

        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        
        const attenSnap = await db.collection('attendance').where('userId', '==', emp.uid).where('timestamp', '>=', startOfMonth).get();
        const presentDays = attenSnap.size;

        const advSnap = await db.collection('employees').doc(docId).collection('advances').where('date', '>=', startOfMonth).orderBy('date', 'desc').get();
        const totalAdvances = advSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);

        const earnedSalary = (emp.baseSalary / 30) * presentDays;
        const netPayable = Math.max(0, earnedSalary - totalAdvances);

        document.getElementById('summary-base-salary').textContent = formatCurrency(emp.baseSalary);
        document.getElementById('summary-earned-salary').textContent = formatCurrency(earnedSalary);
        document.getElementById('summary-total-advances').textContent = `- ${formatCurrency(totalAdvances)}`;
        document.getElementById('summary-net-payable').textContent = formatCurrency(netPayable);

        const historyBody = document.getElementById('adv-history-body');
        if (advSnap.empty) { 
            historyBody.innerHTML = '<tr><td colspan="2" style="text-align: center;">No advances recorded this month.</td></tr>'; 
        } else {
            historyBody.innerHTML = advSnap.docs.map(doc => `<tr><td>${formatDate(doc.data().date)}</td><td>${formatCurrency(doc.data().amount)}</td></tr>`).join('');
        }
        
        showModal(document.getElementById('advance-details-modal'));
    }

    async function showEmployeeDetailsModal(uid) {
        currentlyViewedEmployee = allEmployeeData.find(e => e.uid === uid);
        const emp = currentlyViewedEmployee;
        document.getElementById('detail-id').textContent = emp.employeeId || emp.uid;
        document.getElementById('detail-name').textContent = emp.name;
        document.getElementById('detail-phone').textContent = emp.phone;
        document.getElementById('detail-aadhar').textContent = emp.aadhar;
        document.getElementById('detail-joining-date').textContent = formatDate(emp.joiningDate);
        document.getElementById('detail-base-salary').textContent = `₹${emp.baseSalary.toLocaleString('en-IN')}`;
        
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const attenSnapModal = await db.collection('attendance').where('userId', '==', uid).where('timestamp', '>=', startOfMonth).get();
        const advSnapModal = await db.collection('employees').doc(emp.docId).collection('advances').where('date', '>=', startOfMonth).get();
        
        const presentDays = attenSnapModal.size;
        const totalAdvances = advSnapModal.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
        const netPayable = Math.max(0, (emp.baseSalary / 30) * presentDays - totalAdvances);

        document.getElementById('detail-present-days').textContent = presentDays;
        document.getElementById('detail-advances').textContent = `- ₹${totalAdvances.toLocaleString('en-IN')}`;
        document.getElementById('detail-calculated-salary').textContent = `₹${Math.round(netPayable).toLocaleString('en-IN')}`;
        
        const fullHistorySnap = await db.collection('attendance').where('userId', '==', uid).get();
        const history = fullHistorySnap.docs.map(doc => ({ Timestamp: doc.data().timestamp.toDate() }));
        
        calendarDate = new Date();
        const updateCalendar = () => generateCalendar(calendarDate.getFullYear(), calendarDate.getMonth(), history, 'admin');
        document.getElementById('admin-cal-prev-month-btn').onclick = () => { calendarDate.setMonth(calendarDate.getMonth() - 1); updateCalendar(); };
        document.getElementById('admin-cal-next-month-btn').onclick = () => { calendarDate.setMonth(calendarDate.getMonth() + 1); updateCalendar(); };
        updateCalendar();
        
        showModal(document.getElementById('employee-details-modal'));
    }
    
    function generateCalendar(year, month, history, prefix) {
        const grid = document.getElementById(`${prefix}-cal-days-grid`);
        document.getElementById(`${prefix}-cal-month-year-display`).textContent = `${new Date(year, month).toLocaleString('default', { month: 'long' })} ${year}`;
        grid.innerHTML = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<div class="calendar-day-name">${d}</div>`).join('');
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        grid.innerHTML += Array(firstDay).fill('<div class="calendar-date empty"></div>').join('');
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day).setHours(0,0,0,0);
            const isPresent = history.some(r => new Date(r.Timestamp).setHours(0,0,0,0) === date);
            grid.innerHTML += `<div class="calendar-date ${isPresent ? 'present-day' : ''}">${day}</div>`;
        }
        const presentCount = history.filter(r => new Date(r.Timestamp).getFullYear() === year && new Date(r.Timestamp).getMonth() === month).length;
        document.getElementById(`${prefix}-cal-summary`).innerHTML = `<div class="summary-item"><i class="fas fa-check-circle present-icon"></i> Present: <strong>${presentCount} days</strong></div>`;
    }
});
