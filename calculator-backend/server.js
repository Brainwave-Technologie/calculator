const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(cors({ origin: '*' }));

// MongoDB connection
mongoose.set('strictQuery', false);   // or true, both silence the warning

// const uri = "mongodb+srv://brain:Xeno%402025@myapp.global.mongocluster.cosmos.azure.com/?tls=true&authMechanism=SCRAM-SHA-256&retrywrites=false&maxIdleTimeMS=120000";

 async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Successfully connected to MongoDB");

        // One-time cleanup: clear old auto-generated duplicate_code values in QC assignments
        const QCAssignment = require('./models/QCAssignment');
        const cleared = await QCAssignment.updateMany(
          { duplicate_code: { $ne: '' }, is_deleted: false },
          { $set: { duplicate_code: '' } }
        );
        if (cleared.modifiedCount > 0) {
          console.log(`QC cleanup: cleared ${cleared.modifiedCount} old duplicate_code value(s)`);
        }
    } catch (error) {
        console.error("Connection error:", error);
    }
}

connectDB()
// Routes
app.use('/api/auth', require('./routes/auth.route'));
app.use('/api/project', require('./routes/project.route'));

app.use('/api/upload-resource',require('./routes/resources-bulk-upload.route'))
app.use('/api/productivity', require('./routes/productivity.route'));
app.use('/api/level', require('./routes/subproject-level'));
app.use('/api/resource', require('./routes/Resource.route'));
app.use('/api/billing', require('./routes/billing.route'));
app.use('/api/invoices', require('./routes/Invoice.route'));
app.use('/api/calculator', require('./routes/calculator.route'));
app.use('/api/dashboard', require('./routes/dashboard.route'));
app.use('/api/geography', require('./routes/geography.routes'));
app.use('/api/client', require('./routes/client.routes'));
app.use('/api/masterdb', require('./routes/masterdb.route'));
app.use('/api/upload', require('./routes/Project Upload/bulkupload.route')); //project upload for verisma
app.use('/api/mro-upload', require('./routes/Project Upload/upload.mro.routes')); // project upload for the MRO
app.use('/api/datavant-upload', require('./routes/Project Upload/datavant.route')); // project upload for Datavant
app.use('/api/allocation', require('./routes/allocation-upload.routes'));
//MRO data handling
// app.use('/api/mro-allocation', require('./routes/mro-allocation.routes'));

app.use('/api/admin', require('./routes/adminroutes/admin-resource-cases.routes'));
const mroAllocRoutes = require('./routes/allocation routes/mro-daily-allocations.routes');
const verismaAllocRoutes = require('./routes/allocation routes/verisma-daily-allocations.routes');
const datavantAllocRoutes = require('./routes/allocation routes/datavant-daily-allocations.routes');

// payout
const payoutRoutes = require('./routes/payout');
const payoutExportRoutes = require('./routes/payoutexport');

const processingPayoutRoutes = require('./routes/processingPayout/processingPayout.routes');
app.use('/api/processing-payout', processingPayoutRoutes);
// server.js
const payrollRoutes = require('./routes/payroll.route');
app.use('/api/payroll', payrollRoutes);
app.use('/api/payout', payoutRoutes);
app.use('/api/payout/export', payoutExportRoutes);

app.use('/api/mro-daily-allocations', mroAllocRoutes);
app.use('/api/verisma-daily-allocations', verismaAllocRoutes);
app.use('/api/datavant-daily-allocations', datavantAllocRoutes);

// QC assignments
app.use('/api/qc-assignments', require('./routes/qc-assignment.routes'));

// QC Payout
app.use('/api/qc-payout', require('./routes/qc-payout.routes'));


// app.use('/api/auditlogs', require('./routes/auditlog.route'));
app.get('/', (req, res) => {
    res.send('API is running...');
});
app.listen(PORT,()=>{
    console.log(`Server is running on port ${PORT}`);
})