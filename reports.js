document.addEventListener('DOMContentLoaded', () => {
    let allEmployees = [];
    let fullYearData = {};
    let currentlyViewedEmployee = null;
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const formatDate = (d) => d ? (d.toDate ? d.toDate() : new Date(d)).toLocaleDateString('en-GB') : 'N/A';
    const formatCurrency = (amount) => `₹${parseFloat(amount || 0).toLocaleString('en-IN')}`;

    document.addEventListener('loadReports', initializeReports);

    function initializeReports() {
        const yearSelector = document.getElementById('report-year-selector');
        const monthSelector = document.getElementById('report-month-selector');
        if (yearSelector.options.length > 0) {
            fetchReportData(yearSelector.value, monthSelector.value);
            return;
        }
        const currentYear = new Date().getFullYear();
        for (let i = currentYear; i >= currentYear - 2; i--) {
            yearSelector.innerHTML += `<option value="${i}">${i}</option>`;
        }
        monthSelector.value = new Date().getMonth();

        const updateReport = () => fetchReportData(yearSelector.value, monthSelector.value);
        yearSelector.addEventListener('change', updateReport);
        monthSelector.addEventListener('change', () => renderReport(monthSelector.value));
        
        document.getElementById('report-list-container').addEventListener('click', (e) => {
            const targetRow = e.target.closest('.report-employee-item');
            if (targetRow) {
                showSalaryStatusModal(targetRow.dataset.uid);
            }
        });

        document.getElementById('close-status-modal').addEventListener('click', () => window.hideModals());
        document.getElementById('make-payment-form').addEventListener('submit', handlePayment);
        
        updateReport();
    }

    async function fetchReportData(year, month) {
        document.getElementById('report-list-container').innerHTML = '<p>Loading report data...</p>';
        
        if (!allEmployees.length) {
            const empSnap = await db.collection('employees').get();
            allEmployees = empSnap.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
        }

        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year, 11, 31, 23, 59, 59);

        const attenSnap = await db.collection('attendance').where('timestamp', '>=', startOfYear).where('timestamp', '<=', endOfYear).get();
        
        const dataPromises = allEmployees.map(emp => Promise.all([
            db.collection('employees').doc(emp.docId).collection('advances').where('date', '>=', startOfYear).where('date', '<=', endOfYear).get(),
            db.collection('employees').doc(emp.docId).collection('payments').where('datePaid', '>=', startOfYear).where('datePaid', '<=', endOfYear).get()
        ]));

        const allSubData = await Promise.all(dataPromises);

        const attendanceByUid = {};
        attenSnap.docs.forEach(doc => {
            const data = doc.data();
            if (!attendanceByUid[data.userId]) attendanceByUid[data.userId] = [];
            attendanceByUid[data.userId].push(data.timestamp.toDate());
        });

        fullYearData = {};
        allEmployees.forEach((emp, index) => {
            const advances = allSubData[index][0].docs.map(d => ({...d.data(), date: d.data().date.toDate()}));
            const payments = allSubData[index][1].docs.map(d => ({...d.data(), datePaid: d.data().datePaid.toDate()}));
            
            fullYearData[emp.uid] = Array(12).fill(null).map((_, m) => {
                const presentDays = (attendanceByUid[emp.uid] || []).filter(d => d.getMonth() === m).length;
                const earnedSalary = (emp.baseSalary / 30) * presentDays;
                const totalAdvances = advances.filter(d => d.date.getMonth() === m).reduce((sum, adv) => sum + adv.amount, 0);
                const totalPaid = payments.filter(d => d.datePaid.getMonth() === m).reduce((sum, p) => sum + p.amountPaid, 0);
                return { uid: emp.uid, docId: emp.docId, name: emp.name, employeeId: emp.employeeId, earnedSalary, totalAdvances, totalPaid, paymentHistory: payments.filter(d => d.datePaid.getMonth() === m) };
            });
        });

        renderReport(month);
    }

    function renderReport(month) {
        const container = document.getElementById('report-list-container');
        let html = '<ul class="report-employee-list">';
        
        if (allEmployees.length === 0) {
            html += '<li class="report-employee-item-empty">No employees found.</li>';
        } else {
            allEmployees.forEach(emp => {
                let previousDueBalance = 0;
                for (let i = 0; i < month; i++) {
                    const monthData = fullYearData[emp.uid][i];
                    previousDueBalance += (monthData.earnedSalary - monthData.totalAdvances - monthData.totalPaid);
                }
                
                const currentMonthData = fullYearData[emp.uid][month];
                const netAmountDue = Math.max(0, currentMonthData.earnedSalary + previousDueBalance - currentMonthData.totalAdvances - currentMonthData.totalPaid);

                currentMonthData.previousDueBalance = Math.max(0, previousDueBalance);
                currentMonthData.netAmountDue = netAmountDue;

                let statusBadge;
                if (netAmountDue <= 0.01) { // Use a small threshold for floating point issues
                    statusBadge = '<span class="status-badge status-paid">PAID</span>';
                } else if (currentMonthData.totalPaid > 0 && netAmountDue > 0) {
                    statusBadge = '<span class="status-badge status-partially-paid">PARTIALLY PAID</span>';
                } else {
                    statusBadge = '<span class="status-badge status-unpaid">UNPAID</span>';
                }

                html += `
                    <li class="report-employee-item" data-uid="${emp.uid}">
                        <div class="emp-info"><i class="fas fa-user-circle"></i><div><span class="emp-name">${emp.name}</span><span class="emp-id">ID: ${emp.employeeId || 'N/A'}</span></div></div>
                        <div class="emp-salary-info"><strong class="emp-amount-due">${formatCurrency(netAmountDue)}</strong>${statusBadge}</div>
                    </li>`;
            });
        }
        html += '</ul>';
        container.innerHTML = html;
    }

    function showSalaryStatusModal(uid) {
        const month = document.getElementById('report-month-selector').value;
        currentlyViewedEmployee = fullYearData[uid][month];
        if (!currentlyViewedEmployee) return;

        const emp = currentlyViewedEmployee;
        document.getElementById('status-modal-emp-name').textContent = emp.name;
        document.getElementById('status-modal-current-salary').textContent = formatCurrency(emp.earnedSalary);
        document.getElementById('status-modal-prev-balance').textContent = formatCurrency(emp.previousDueBalance);
        document.getElementById('status-modal-advances').textContent = `- ${formatCurrency(emp.totalAdvances)}`;
        document.getElementById('status-modal-paid').textContent = `- ${formatCurrency(emp.totalPaid)}`;
        document.getElementById('status-modal-total-due').textContent = formatCurrency(emp.netAmountDue);
        
        const paymentInput = document.getElementById('payment-amount');
        paymentInput.value = Math.round(emp.netAmountDue > 0 ? emp.netAmountDue : 0);
        paymentInput.max = Math.round(emp.netAmountDue > 0 ? emp.netAmountDue : 0);

        const historyList = document.getElementById('payment-history-list');
        if (emp.paymentHistory.length === 0) {
            historyList.innerHTML = '<li>No payments made this month.</li>';
        } else {
            historyList.innerHTML = emp.paymentHistory.map(p => `<li><span class="date">${formatDate(p.datePaid)}</span> <strong class="amount">${formatCurrency(p.amountPaid)}</strong></li>`).join('');
        }
        
        window.showModal(document.getElementById('salary-status-modal'));
    }

    async function handlePayment(e) {
        e.preventDefault();
        if (!currentlyViewedEmployee) return;
        
        const amountToPay = parseFloat(document.getElementById('payment-amount').value);
        if (isNaN(amountToPay) || amountToPay <= 0) {
            return window.showMessage("Error", "Please enter a valid amount.", false);
        }

        const confirmBtn = e.target.querySelector('button[type="submit"]');
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        
        try {
            await db.collection('employees').doc(currentlyViewedEmployee.docId).collection('payments').add({
                amountPaid: amountToPay,
                datePaid: firebase.firestore.Timestamp.now(),
                month: parseInt(document.getElementById('report-month-selector').value),
                year: parseInt(document.getElementById('report-year-selector').value)
            });

            window.hideModals(); // Pehle modal hide karein
            window.showMessage("Success", "Payment confirmed successfully!", true); // Phir message dikhayein
            
            const yearSelector = document.getElementById('report-year-selector');
            const monthSelector = document.getElementById('report-month-selector');
            fetchReportData(yearSelector.value, monthSelector.value);

        } catch (error) {
            console.error("Payment failed:", error);
            window.showMessage("Error", `Payment failed: ${error.message}`, false);
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-check"></i> Confirm Payment';
        }
    }
});
